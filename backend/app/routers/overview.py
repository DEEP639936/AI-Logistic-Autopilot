"""Overview route — command-center KPIs, risk feed, map payload, live weather."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db, iso_utc, now_ms
from ..dto import parse_json_array, parse_json_object, parse_risk_factors
from ..engines.rates import BASELINE_FUEL_EFF_KMPL
from ..errors import js_round, ok
from ..hubs import HUBS, hub
from ..live.weather import WEATHER_ATTRIBUTION, WEATHER_SOURCE_URL, fetch_hubs_weather
from ..models import Disruption, Recommendation, Shipment, ShipmentEvent, Vehicle
from ..security import require_user
from ..thresholds import get_org_thresholds

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/overview", tags=["overview"])

DAY_MS = 24 * 3600 * 1000


@router.get("")
async def overview(db: OrmSession = Depends(get_db), user: Any = Depends(require_user)) -> Any:
    org_id = user.orgId
    t = get_org_thresholds(db, org_id)
    values = t["values"]
    config_version = f"{t['version']}:{t['configHash']}"
    now = now_ms()
    since_30d = now - 30 * DAY_MS

    shipments = (
        db.query(Shipment)
        .filter(Shipment.orgId == org_id)
        .order_by(Shipment.createdAt.desc())
        .all()
    )
    vehicles = db.query(Vehicle).filter(Vehicle.orgId == org_id).all()
    disruption_rows = (
        db.query(Disruption)
        .filter(Disruption.orgId == org_id, Disruption.status != "resolved")
        .order_by(Disruption.createdAt.desc())
        .all()
    )
    events = (
        db.query(ShipmentEvent, Shipment.ref)
        .join(Shipment, ShipmentEvent.shipmentId == Shipment.id)
        .filter(Shipment.orgId == org_id)
        .order_by(ShipmentEvent.at.desc())
        .limit(14)
        .all()
    )
    pending_recs = (
        db.query(Recommendation)
        .filter(Recommendation.orgId == org_id, Recommendation.status == "pending")
        .order_by(Recommendation.createdAt.desc())
        .limit(8)
        .all()
    )
    delivered_events = (
        db.query(ShipmentEvent, Shipment.etaAt)
        .join(Shipment, ShipmentEvent.shipmentId == Shipment.id)
        .filter(Shipment.orgId == org_id, ShipmentEvent.type == "Delivered", ShipmentEvent.at >= since_30d)
        .all()
    )
    fleet_count = db.query(Vehicle).filter(Vehicle.orgId == org_id).count()

    # ---------------- KPIs ----------------
    active = [s for s in shipments if s.status in ("scheduled", "assigned", "in_transit")]
    delivered_recent = [(at, eta) for (ev, eta) in delivered_events if (at := ev.at) >= since_30d]
    on_time_buffer_ms = values["sla"]["on_time_buffer_min"] * 60 * 1000
    on_time_count = sum(1 for delivered_at, eta in delivered_recent if delivered_at <= eta + on_time_buffer_ms)
    on_time_pct = js_round((on_time_count / len(delivered_recent)) * 100) if delivered_recent else 0

    medium_min = values["delay_risk"]["medium_min"]
    at_risk = sum(1 for s in active if s.riskScore >= medium_min)

    in_use = sum(1 for v in vehicles if v.status == "in_use")
    fleet_utilization_pct = js_round((in_use / fleet_count) * 100) if fleet_count > 0 else 0

    cost_basis = [
        s for s in shipments if s.createdAt >= since_30d and s.status not in ("draft", "cancelled")
    ]
    cost_per_km_inr = 0
    if cost_basis:
        cost_per_km_inr = js_round(sum(s.costInr / max(s.distanceKm, 1) for s in cost_basis) / len(cost_basis))

    co2_per_litre = values["carbon_targets"]["diesel_kg_co2_per_litre"]
    in_transit = [s for s in shipments if s.status == "in_transit"]
    vehicle_by_id = {v.id: v for v in vehicles}
    co2_today_kg = (
        js_round(
            sum(
                (s.distanceKm / max(
                    vehicle_by_id[s.assignedVehicleId].fuelEffKmpl
                    if s.assignedVehicleId and s.assignedVehicleId in vehicle_by_id
                    else BASELINE_FUEL_EFF_KMPL,
                    0.1,
                ))
                * co2_per_litre
                for s in in_transit
            )
            * 10
        )
        / 10
    )

    # ---------------- Live weather (Open-Meteo, cached 15 min) ----------------
    # Hubs prioritised by what the operation actually touches right now:
    # in-transit + assigned corridors first, then the rest of the network.
    touched: set[str] = set()
    for s in in_transit + [x for x in shipments if x.status == "assigned"]:
        touched.add(s.originCity)
        touched.add(s.destCity)
    ordered_hubs = [h for h in HUBS if h.city in touched][:8]
    ordered_hubs += [h for h in HUBS if h.city not in touched]
    ordered_hubs = ordered_hubs[:8]
    live_weather = await fetch_hubs_weather([{"city": h.city, "lat": h.lat, "lng": h.lng} for h in ordered_hubs])
    weather_by_city = {w.city: w for w in live_weather}

    # ---------------- Risk feed ----------------
    risk_pool = in_transit + [s for s in shipments if s.status == "assigned"]
    risk_pool.sort(key=lambda s: s.riskScore, reverse=True)
    risk_feed = []
    for s in risk_pool[:6]:
        factors = parse_risk_factors(s.riskFactors)
        w = weather_by_city.get(s.destCity) or weather_by_city.get(s.originCity)
        risk_feed.append(
            {
                "shipmentId": s.id,
                "ref": s.ref,
                "route": f"{s.originCity} → {s.destCity}",
                "riskScore": s.riskScore,
                "riskBand": s.riskBand,
                "etaAt": iso_utc(s.etaAt),
                "slackMin": js_round((s.etaAt - now) / 60_000),
                "topReason": factors[0]["factor"] if factors else "Schedule slack",
                "weather": (
                    {"label": w.label, "risk": w.risk, "precipMm": w.precipMm, "tempC": w.tempC} if w else None
                ),
            }
        )

    # ---------------- Recommendations ----------------
    recommendations = [
        {
            "id": r.id,
            "type": r.type,
            "refId": r.refId,
            "title": r.title,
            "summary": r.summary,
            "confidence": r.confidence,
            "reasons": parse_json_array(r.reasons),
            "impact": parse_json_object(r.impact) or {},
            "status": "pending",
            "dataStatus": r.dataStatus,
            "createdAt": iso_utc(r.createdAt),
        }
        for r in pending_recs
    ]

    # ---------------- Map ----------------
    live = [
        {
            "id": s.id,
            "ref": s.ref,
            "from": [s.originLat, s.originLng],
            "to": [s.destLat, s.destLng],
            "progress": s.progress,
            "riskBand": s.riskBand,
            "vehicleReg": vehicle_by_id[s.assignedVehicleId].regNo
            if s.assignedVehicleId and s.assignedVehicleId in vehicle_by_id
            else "Market vehicle",
        }
        for s in in_transit
    ]

    map_disruptions = []
    for d_row in disruption_rows:
        origin_city = d_row.corridor.split("→")[0].strip() if d_row.corridor else ""
        lat, lng = 20.5937, 78.9629
        try:
            h = hub(origin_city)
            lat, lng = h.lat, h.lng
        except Exception:  # noqa: BLE001 — keep country centroid
            pass
        map_disruptions.append({"id": d_row.id, "title": d_row.title, "severity": d_row.severity, "lat": lat, "lng": lng})

    return ok(
        {
            "kpis": {
                "activeShipments": len(active),
                "onTimePct": on_time_pct,
                "atRisk": at_risk,
                "fleetUtilizationPct": fleet_utilization_pct,
                "costPerKmInr": cost_per_km_inr,
                "co2TodayKg": co2_today_kg,
            },
            "riskFeed": risk_feed,
            "recommendations": recommendations,
            "activity": [
                {
                    "id": ev.id,
                    "at": iso_utc(ev.at),
                    "type": ev.type,
                    "note": ev.note,
                    "ref": ref,
                }
                for ev, ref in events
            ],
            "map": {
                "hubs": [{"city": h.city, "lat": h.lat, "lng": h.lng} for h in HUBS],
                "vehicles": [
                    {
                        "id": v.id,
                        "regNo": v.regNo,
                        "lat": v.lat,
                        "lng": v.lng,
                        "status": v.status,
                        "city": v.currentCity,
                    }
                    for v in vehicles
                ],
                "live": live,
                "disruptions": map_disruptions,
            },
            "fleetStatus": {
                "available": sum(1 for v in vehicles if v.status == "available"),
                "inUse": in_use,
                "maintenance": sum(1 for v in vehicles if v.status == "maintenance"),
            },
            "liveWeather": [
                {
                    "city": w.city,
                    "tempC": w.tempC,
                    "precipMm": w.precipMm,
                    "windKph": w.windKph,
                    "label": w.label,
                    "precipTodayMm": w.precipTodayMm,
                    "risk": w.risk,
                }
                for w in live_weather
            ],
            "liveSources": [
                {"name": WEATHER_ATTRIBUTION, "status": "live", "url": WEATHER_SOURCE_URL},
            ],
            "meta": {
                "dataStatus": "demo",
                "configVersion": config_version,
                "demoSimulator": bool(values["feature_flags"]["demo_simulator"]),
                "tickSeconds": values["demo"]["map_tick_seconds"],
            },
        }
    )
