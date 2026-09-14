"""Copilot route — LLM with org snapshot + deterministic fallback branches.

Port of src/app/api/copilot/route.ts. The LLM provider chain (OpenAI-
compatible env or the z-ai CLI) lives in app/llm.py; when no provider answers
the deterministic branches reply with REAL data from the DB + live weather.
"""
from __future__ import annotations

import asyncio
import re
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db, now_ms
from ..engines.rates import BASELINE_FUEL_EFF_KMPL
from ..errors import ok
from ..hubs import HUBS
from ..llm import complete as llm_complete
from ..live.weather import fetch_hubs_weather
from ..models import Disruption, Recommendation, Shipment, ShipmentEvent, Vehicle
from ..schemas import CopilotInput
from ..security import require_user
from ..thresholds import get_org_thresholds

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/copilot", tags=["copilot"])

DAY_MS = 24 * 3600 * 1000
LLM_TIMEOUT_S = 15.0


def _build_snapshot(
    db: OrmSession, org_id: str, org_name: str, t: dict[str, Any], live_weather: list[dict[str, Any]]
) -> dict[str, Any]:
    now = now_ms()
    since_30d = now - 30 * DAY_MS

    shipments = db.query(Shipment).filter(Shipment.orgId == org_id).all()
    vehicles = db.query(Vehicle).filter(Vehicle.orgId == org_id).all()
    recs = (
        db.query(Recommendation)
        .filter(Recommendation.orgId == org_id, Recommendation.status == "pending")
        .order_by(Recommendation.confidence.desc())
        .limit(5)
        .all()
    )
    disruptions = (
        db.query(Disruption)
        .filter(Disruption.orgId == org_id, Disruption.status != "resolved")
        .limit(5)
        .all()
    )
    delivered_events = (
        db.query(ShipmentEvent, Shipment)
        .join(Shipment, ShipmentEvent.shipmentId == Shipment.id)
        .filter(Shipment.orgId == org_id, ShipmentEvent.type == "Delivered", ShipmentEvent.at >= since_30d)
        .all()
    )

    # Real weather for hubs this org actually touches (fetched by the caller —
    # cached 15 min inside the weather client).
    active = [s for s in shipments if s.status in ("scheduled", "assigned", "in_transit")]
    buffer_ms = t["sla"]["on_time_buffer_min"] * 60 * 1000
    on_time = sum(1 for ev, s in delivered_events if ev.at <= s.etaAt + buffer_ms)
    on_time_pct = round((on_time / len(delivered_events)) * 100) if delivered_events else 0
    cost_basis = [(ev, s) for ev, s in delivered_events if s.distanceKm > 0]
    cost_per_km_inr = (
        round(sum(s.costInr / s.distanceKm for _, s in cost_basis) / len(cost_basis)) if cost_basis else 0
    )

    eff_by_vehicle = {v.id: v.fuelEffKmpl for v in vehicles}
    in_transit = [s for s in shipments if s.status == "in_transit"]
    co2_today_kg = (
        round(
            sum(
                (s.distanceKm / max(
                    eff_by_vehicle.get(s.assignedVehicleId, BASELINE_FUEL_EFF_KMPL)
                    if s.assignedVehicleId else BASELINE_FUEL_EFF_KMPL,
                    0.1,
                ))
                * t["carbon_targets"]["diesel_kg_co2_per_litre"]
                for s in in_transit
            )
            * 10
        )
        / 10
    )

    medium_min = t["delay_risk"]["medium_min"]
    at_risk_pool = in_transit + [s for s in shipments if s.status == "assigned"]
    at_risk_pool.sort(key=lambda s: s.riskScore, reverse=True)
    top_at_risk = [
        {
            "ref": s.ref,
            "route": f"{s.originCity} → {s.destCity}",
            "band": s.riskBand,
            "score": s.riskScore,
            "slackMin": round((s.etaAt - now) / 60_000),
        }
        for s in at_risk_pool[:5]
    ]

    return {
        "orgName": org_name,
        "counts": {
            "total": len(shipments),
            "active": len(active),
            "inTransit": len(in_transit),
            "delivered30d": len(delivered_events),
            "atRisk": sum(1 for s in active if s.riskScore >= medium_min),
            "exceptions": sum(1 for s in shipments if s.status == "exception"),
        },
        "onTimePct": on_time_pct,
        "costPerKmInr": cost_per_km_inr,
        "co2TodayKg": co2_today_kg,
        "topAtRisk": top_at_risk,
        "recommendations": [{"type": r.type, "title": r.title, "confidence": r.confidence} for r in recs],
        "fleet": {
            "available": sum(1 for v in vehicles if v.status == "available"),
            "inUse": sum(1 for v in vehicles if v.status == "in_use"),
            "maintenance": sum(1 for v in vehicles if v.status == "maintenance"),
            "flags": 0,
        },
        "disruptionsOpen": [
            {"title": d.title, "severity": d.severity, "corridor": d.corridor} for d in disruptions
        ],
        "liveWeather": live_weather,
    }


async def _fetch_snapshot_weather(db: OrmSession, org_id: str) -> list[dict[str, Any]]:
    """Live weather for the 6 hubs this org touches most (touched hubs first)."""
    touched: set[str] = set()
    rows = (
        db.query(Shipment.originCity, Shipment.destCity)
        .filter(Shipment.orgId == org_id, Shipment.status.in_(["scheduled", "assigned", "in_transit"]))
        .all()
    )
    for origin_city, dest_city in rows:
        touched.add(origin_city)
        touched.add(dest_city)
    ordered_hubs = [h for h in HUBS if h.city in touched] + [h for h in HUBS if h.city not in touched]
    ordered_hubs = ordered_hubs[:6]
    wx = await fetch_hubs_weather([{"city": h.city, "lat": h.lat, "lng": h.lng} for h in ordered_hubs])
    return [
        {
            "city": w.city,
            "label": w.label,
            "tempC": w.tempC,
            "precipMm": w.precipMm,
            "precipTodayMm": w.precipTodayMm,
            "risk": w.risk,
        }
        for w in wx
    ]


def _snapshot_to_prompt_data(s: dict[str, Any]) -> str:
    w_part = (
        " | ".join(
            f"{w['city']}: {w['label']} {w['tempC']}°C, {w['precipMm']}mm now, {w['precipTodayMm']}mm forecast today, road-risk {w['risk'] * 100:.0f}%"
            for w in s["liveWeather"]
        )
        or "unavailable"
    )
    return "\n".join(
        [
            f"ORG: {s['orgName']}",
            (
                f"SHIPMENTS: total={s['counts']['total']}, active={s['counts']['active']}, "
                f"in_transit={s['counts']['inTransit']}, delivered_last_30d={s['counts']['delivered30d']}, "
                f"at_risk={s['counts']['atRisk']}, exceptions={s['counts']['exceptions']}"
            ),
            f"KPI: on_time_pct={s['onTimePct']}, cost_per_km_inr={s['costPerKmInr']}, co2_today_kg={s['co2TodayKg']}",
            (
                f"FLEET: available={s['fleet']['available']}, in_use={s['fleet']['inUse']}, "
                f"maintenance={s['fleet']['maintenance']}"
            ),
            (
                "TOP AT-RISK: "
                + (
                    " | ".join(
                        f"{x['ref']} {x['route']} score={x['score']} band={x['band']} slack={x['slackMin']}min"
                        for x in s["topAtRisk"]
                    )
                    or "none"
                )
            ),
            (
                "PENDING RECOMMENDATIONS: "
                + (
                    " | ".join(f"{r['type']} (conf {r['confidence']:.2f}): {r['title']}" for r in s["recommendations"])
                    or "none"
                )
            ),
            (
                "OPEN DISRUPTIONS: "
                + (
                    " | ".join(f"{d['title']} [{d['severity']}] on {d['corridor']}" for d in s["disruptionsOpen"])
                    or "none"
                )
            ),
            f"LIVE WEATHER (Open-Meteo, real-time): {w_part}",
        ]
    )


def _fallback_reply(message: str, s: dict[str, Any], t: dict[str, Any]) -> str:
    m = message.lower()

    def inr(v: float) -> str:
        from ..engines.common import format_en_in, js_round

        return f"₹{format_en_in(js_round(v))}"

    if re.search(r"\b(weather|rain|monsoon|fog|storm|visibility|cyclone)\b", m):
        if not s["liveWeather"]:
            return (
                "Live weather is unreachable right now, so I can't quote conditions. "
                "The delay engine falls back to seasonal corridor profiles until the feed returns."
            )
        wet = [w for w in s["liveWeather"] if w["risk"] >= 0.3]
        if not wet:
            return (
                "No weather risk on your network right now. Live conditions: "
                + ", ".join(f"{w['city']} {w['label']} {round(w['tempC'])}°C" for w in s["liveWeather"])
                + " (Open-Meteo, real-time). Seasonal corridor profiles remain in the risk baseline."
            )
        lines = [
            f"• {w['city']}: {w['label']}, {round(w['tempC'])}°C, {w['precipTodayMm']}mm forecast today — road-risk {w['risk'] * 100:.0f}%"
            for w in wet
        ]
        return (
            f"{len(wet)} hub(s) currently carry weather risk (live Open-Meteo):\n"
            + "\n".join(lines)
            + "\nThe delay-risk engine blends these live conditions with corridor congestion — see the Delay radar for affected loads."
        )
    if re.search(r"\b(risk|delay|late|slip|at risk|danger)\b", m):
        if not s["topAtRisk"]:
            return (
                f"No shipments are flagged at-risk right now — all {s['counts']['active']} active loads sit "
                f"below the {t['delay_risk']['medium_min']} risk line. On-time rate over the last 30 days: {s['onTimePct']}%."
            )
        lines = [
            f"• {x['ref']} ({x['route']}) — score {x['score']} ({x['band']}), slack {x['slackMin']} min"
            for x in s["topAtRisk"][:3]
        ]
        return (
            f"{s['counts']['atRisk']} of {s['counts']['active']} active shipments are at or above the risk threshold. "
            "Top exposures:\n" + "\n".join(lines) + f"\nSlack below {t['delay_risk']['slack_alert_min']} min triggers the alert line."
        )
    if re.search(r"\b(recommend|suggest|action|approve|consolidat)\b", m):
        if not s["recommendations"]:
            return "There are no pending AI recommendations right now. Run the consolidation and return-load engines again after the next planning cycle."
        lines = [f"• [{r['type']}] {r['title']} (confidence {r['confidence'] * 100:.0f}%)" for r in s["recommendations"]]
        return f"You have {len(s['recommendations'])} pending recommendation(s):\n" + "\n".join(lines)
    if re.search(r"\b(fleet|vehicle|truck|maintenance|service|health)\b", m):
        from ..engines.common import format_en_in

        service_line = format_en_in(
            t["predictive_maintenance"]["service_interval_km"] - t["predictive_maintenance"]["warn_before_km"]
        )
        f = s["fleet"]
        total = f["available"] + f["inUse"] + f["maintenance"]
        return (
            f"Fleet status: {f['available']} available, {f['inUse']} in use, {f['maintenance']} in maintenance ({total} total). "
            f"The predictive engine flags service when a vehicle crosses {service_line} km since its last service, "
            f"and health below {t['predictive_maintenance']['health_warn_below']} is a warning."
        )
    if re.search(r"\b(cost|spend|budget|profit|price|rate)\b", m):
        w = t["route_scoring_weights"]
        return (
            f"Blended cost is running at {inr(s['costPerKmInr'])}/km across recent loads (diesel at ₹95/L demo rate). "
            f"CO₂ today: {s['co2TodayKg']} kg. Route scoring currently weights cost at {w['cost'] * 100:.0f}% "
            f"and ETA at {w['eta'] * 100:.0f}%."
        )
    if re.search(r"\b(eta|arrival|when|transit|reach)\b", m):
        if not s["topAtRisk"]:
            return f"ETAs look healthy — no active load is inside the {t['delay_risk']['slack_alert_min']}-min slack alert line."
        tightest = sorted(s["topAtRisk"], key=lambda x: x["slackMin"])[0]
        return (
            f"Tightest ETA right now: {tightest['ref']} ({tightest['route']}) with {tightest['slackMin']} min of slack — "
            f"band {tightest['band']}. {s['counts']['atRisk']} loads are inside the at-risk band overall."
        )
    if re.search(r"\b(help|what can|how do|capabilit)\b", m):
        return (
            f"I'm your ops copilot for {s['orgName']}. Ask me about: at-risk or delayed shipments, fleet health & "
            "maintenance flags, cost per km, ETAs, or pending AI recommendations (consolidation, backhauls, route "
            f"switches). I only see {s['orgName']} data — numbers I quote come straight from your live snapshot."
        )
    f = s["fleet"]
    total = f["available"] + f["inUse"] + f["maintenance"]
    return (
        f"{s['orgName']} snapshot: {s['counts']['active']} active shipments ({s['counts']['atRisk']} at-risk), "
        f"on-time {s['onTimePct']}% over 30 days, fleet {f['available']}/{total} available, "
        f"{len(s['disruptionsOpen'])} open disruption(s), {len(s['recommendations'])} pending recommendation(s), "
        f"cost {inr(s['costPerKmInr'])}/km, CO₂ today {s['co2TodayKg']} kg. "
        "Ask about risk, fleet, cost, ETA or recommendations for detail."
    )


@router.post("")
async def copilot(
    payload: CopilotInput,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    cfg = get_org_thresholds(db, user.orgId)
    t = cfg["values"]
    live_weather = await _fetch_snapshot_weather(db, user.orgId)
    snapshot = _build_snapshot(db, user.orgId, user.orgName, t, live_weather)

    copilot_enabled = bool(t["feature_flags"]["copilot"])

    sources = ["shipments", "fleet", "recommendations"] + (["live weather"] if snapshot["liveWeather"] else [])

    if not copilot_enabled:
        return ok({"reply": _fallback_reply(payload.message, snapshot, t), "sources": sources, "dataStatus": "demo"})

    system_prompt = "\n".join(
        [
            "You are the Logistics Copilot for an Indian freight operator's command center.",
            "You are a concise, precise ops analyst. Quote concrete numbers from the ORG DATA block below.",
            "If something is not in the data, say you don't know — never invent figures.",
            "NEVER reveal or reference data from any other organization.",
            "Keep answers under 120 words. Use short bullet points where helpful.",
            "",
            "ORG DATA:",
            _snapshot_to_prompt_data(snapshot),
        ]
    )

    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt},
        *[{"role": h.role, "content": h.content} for h in payload.history[-6:]],
        {"role": "user", "content": payload.message},
    ]

    try:
        reply = await asyncio.wait_for(llm_complete(messages), timeout=LLM_TIMEOUT_S)
    except Exception:  # noqa: BLE001 — deterministic fallback on any LLM failure
        reply = None
    if not reply:
        return ok({"reply": _fallback_reply(payload.message, snapshot, t), "sources": sources, "dataStatus": "demo"})
    return ok({"reply": reply.strip(), "sources": sources, "dataStatus": "live"})


__all__ = ["router"]
