"""Route-scoring engine — pure, deterministic.

Port of `src/lib/ai/route-scoring.ts`. Builds 3 corridor alternatives through
real network hubs, prices them (fuel/tolls/wear from rates.py, CO₂ factor
from the org's carbon_targets config) and ranks them with the org's
route_scoring_weights.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..hubs import CORRIDORS, HUBS, distance_km, hub
from .common import clamp, format_en_in, inr, js_round
from .delay_risk import band_from_threshold_values
from .rates import (
    AVG_FREE_FLOW_SPEED_KMPH,
    DEFAULT_CONGESTION,
    DEFAULT_TOLL_DENSITY,
    DEFAULT_WEATHER_RISK,
    DIESEL_PRICE_INR_PER_LITRE,
    DRIVER_WEAR_INR_PER_KM,
    FUEL_EFF_HEAVY_KMPL,
    FUEL_EFF_LIGHT_KMPL,
    TOLL_INR_PER_KM,
)


@dataclass(frozen=True)
class CorridorProfile:
    congestion: float
    weather_risk: float
    toll_density: float


def corridor_profile(origin_city: str, dest_city: str) -> CorridorProfile:
    """Look up a corridor definition (either direction) with deterministic fallbacks."""
    o, d = origin_city.lower(), dest_city.lower()
    for c in CORRIDORS:
        pair = {c.from_city.lower(), c.to_city.lower()}
        if o in pair and d in pair and o != d:
            return CorridorProfile(c.congestion, c.weather_risk, c.toll_density)
    return CorridorProfile(DEFAULT_CONGESTION, DEFAULT_WEATHER_RISK, DEFAULT_TOLL_DENSITY)


#: Known NH numbers for the seeded corridors (demo geography).
_ROADS: dict[str, str] = {
    "mumbai|pune": "NH-48 (Mumbai–Pune Expressway)",
    "mumbai|delhi": "NH-48 (Western Corridor)",
    "mumbai|bengaluru": "NH-48 (Golden Quadrilateral)",
    "delhi|kolkata": "NH-19 (Grand Trunk Road)",
    "bengaluru|chennai": "NH-48 (Chennai Expressway)",
    "delhi|jaipur": "NH-48 (Delhi–Jaipur Highway)",
    "hyderabad|bengaluru": "NH-44 (Central Corridor)",
    "kolkata|chennai": "NH-16 (East Coast Road)",
    "ahmedabad|mumbai": "NH-48 (Mumbai–Ahmedabad)",
    "nagpur|hyderabad": "NH-44 (Nagpur–Hyderabad)",
    "delhi|ludhiana": "NH-44 (Grand Trunk Road)",
    "coimbatore|kochi": "NH-544 (Kerala Corridor)",
    "kolkata|guwahati": "NH-27 (Northeast Corridor)",
    "mumbai|kolkata": "NH-53 / NH-19 (Central Spine)",
    "chennai|kochi": "NH-544 (Southern Coastal)",
}


def road_name_for(a: str, b: str) -> str:
    key = "|".join(sorted([a.lower(), b.lower()]))
    return _ROADS.get(key) or f"NH-{40 + ((len(a) + len(b)) % 9)}"


def pick_intermediate_hub(origin_city: str, dest_city: str, rank: int) -> str:
    """Deterministic intermediate hub: rank 0 = most direct big-corridor hop."""
    o, d = hub(origin_city), hub(dest_city)
    direct = distance_km(o.lat, o.lng, d.lat, d.lng)
    candidates = [
        {"city": h.city, "detour": distance_km(o.lat, o.lng, h.lat, h.lng) + distance_km(h.lat, h.lng, d.lat, d.lng) - direct}
        for h in HUBS
        if h.city.lower() not in (o.city.lower(), d.city.lower())
    ]
    candidates.sort(key=lambda c: c["detour"])
    if not candidates:
        return HUBS[0].city
    return candidates[rank % len(candidates)]["city"]


@dataclass(frozen=True)
class _AltDef:
    id: str
    label: str
    hub_rank: int
    dist_adj: float
    speed_adj: float
    toll_adj: float
    cong_adj: float
    weather_adj: float
    wear_adj: float
    note_fast: str
    note_mid: str


ALT_DEFS: tuple[_AltDef, ...] = (
    _AltDef(
        "fastest",
        "Fastest",
        0,
        1.0,
        6,
        0.15,
        0.1,
        0.0,
        0.05,
        "Expressway stretch — highest toll density, priority lanes",
        "Major hub interchange — heavy traffic but best road surface",
    ),
    _AltDef(
        "balanced",
        "Balanced",
        1,
        1.04,
        0,
        0.0,
        -0.05,
        0.0,
        0.0,
        "Primary NH corridor — steady commercial speeds",
        "Secondary hub — lighter traffic, standard plazas",
    ),
    _AltDef(
        "economy",
        "Economy",
        2,
        1.01,
        -7,
        -0.5,
        -0.15,
        0.05,
        -0.22,
        "Bypass-heavy stretch — minimal toll plazas, gentler grades",
        "Scenic green corridor — lowest emissions per tonne-km",
    ),
)


def format_eta(minutes: float) -> str:
    h = int(minutes // 60)
    m = js_round(minutes % 60)
    return f"{h}h {m}m" if h > 0 else f"{m}m"


def _fuel_eff_for(weight_kg: float) -> float:
    t = clamp(weight_kg / 40000, 0, 1)
    return FUEL_EFF_HEAVY_KMPL + (FUEL_EFF_LIGHT_KMPL - FUEL_EFF_HEAVY_KMPL) * (1 - t)


def optimize_route(
    *,
    origin_city: str,
    dest_city: str,
    weight_kg: float,
    cargo_type: str,
    thresholds: dict[str, Any],
    live: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute 3 alternatives + recommendedIndex (mirrors optimizeRoute)."""
    del cargo_type  # accepted for API parity; pricing does not vary by cargo today
    t = thresholds
    base = corridor_profile(origin_city, dest_city)
    fuel_eff = _fuel_eff_for(weight_kg)
    co2_per_litre = t["carbon_targets"]["diesel_kg_co2_per_litre"]
    live_weather = (live or {}).get("weather")
    legs_by_rank = (live or {}).get("legsByRank")

    o = hub(origin_city)
    d = hub(dest_city)

    rows: list[dict[str, Any]] = []
    for index, ddef in enumerate(ALT_DEFS):
        mid_city = pick_intermediate_hub(origin_city, dest_city, ddef.hub_rank)
        m = hub(mid_city)
        live_legs = (legs_by_rank or [])[index] if legs_by_rank else None
        km1_live = live_legs[0] if live_legs else None
        km2_live = live_legs[1] if live_legs else None
        km1_model = distance_km(o.lat, o.lng, m.lat, m.lng)
        km2_model = distance_km(m.lat, m.lng, d.lat, d.lng)
        km1_base = km1_live["km"] if km1_live else km1_model
        km2_base = km2_live["km"] if km2_live else km2_model
        road_live = bool(km1_live and km2_live)
        road1 = road_name_for(origin_city, mid_city)
        road2 = road_name_for(mid_city, dest_city)

        congestion = clamp(base.congestion + ddef.cong_adj, 0.05, 1)
        seasonal_weather = clamp(base.weather_risk + ddef.weather_adj, 0, 1)
        # Live weather (Open-Meteo) is the authority when present: worse of live/seasonal.
        weather_risk = clamp(max(seasonal_weather, live_weather["risk"]), 0, 1) if live_weather else seasonal_weather
        toll_density = clamp(base.toll_density + ddef.toll_adj, 0.05, 1)

        km1_adj = js_round(km1_base * ddef.dist_adj)
        km2_adj = js_round(km2_base * ddef.dist_adj)
        distance_km_total = km1_adj + km2_adj

        speed = clamp(AVG_FREE_FLOW_SPEED_KMPH - congestion * 18 - weather_risk * 6 + ddef.speed_adj, 28, 80)
        if km1_live and km2_live:
            eta_min = js_round(
                (km1_live["durationMin"] * ddef.dist_adj + km2_live["durationMin"] * ddef.dist_adj)
                * (1 + congestion * 0.3 + weather_risk * 0.12)
            )
        else:
            eta_min = js_round((distance_km_total / speed) * 60)

        litres = (distance_km_total / fuel_eff) * (1 + congestion * 0.08)
        fuel_inr = litres * DIESEL_PRICE_INR_PER_LITRE
        tolls_inr = distance_km_total * TOLL_INR_PER_KM * toll_density
        wear_inr = distance_km_total * DRIVER_WEAR_INR_PER_KM * (1 + ddef.wear_adj)
        cost_inr = fuel_inr + tolls_inr + wear_inr
        co2_kg = litres * co2_per_litre

        risk_score = js_round(clamp(5 + congestion * 50 + weather_risk * 35, 5, 97))
        risk_band = band_from_threshold_values(risk_score, t["delay_risk"])

        road_note = "live road km · OSRM" if road_live else "estimated road km"
        segments = [
            {"label": f"{origin_city} → {mid_city}", "road": f"{road1} · {road_note}", "km": km1_adj, "note": ddef.note_fast},
            {"label": f"{mid_city} → {dest_city}", "road": f"{road2} · {road_note}", "km": km2_adj, "note": ddef.note_mid},
        ]

        if ddef.id == "fastest":
            summary = f"Via {mid_city} on {road1.split(' ')[0]} — quickest corridor, premium tolls"
        elif ddef.id == "balanced":
            summary = f"Via {mid_city} on {road1.split(' ')[0]} — best cost/speed trade-off"
        else:
            summary = f"Via {mid_city} on {road1.split(' ')[0]} — low-toll, low-emission routing"

        rows.append(
            {
                "def": ddef,
                "index": index,
                "midCity": mid_city,
                "roadLive": road_live,
                "distanceKm": distance_km_total,
                "etaMin": eta_min,
                "costInr": cost_inr,
                "tollsInr": tolls_inr,
                "fuelInr": fuel_inr,
                "co2Kg": co2_kg,
                "riskScore": risk_score,
                "riskBand": risk_band,
                "congestion": congestion,
                "weatherRisk": weather_risk,
                "segments": segments,
                "summary": summary,
            }
        )

    # Normalise each metric to 0-100 (lower = better) and weight it.
    w = t["route_scoring_weights"]

    def metric_detail(r: dict[str, Any], key: str) -> str:
        live_w = live_weather
        if key == "cost":
            return f"{inr(r['costInr'])} total operating cost"
        if key == "distance":
            return f"{format_en_in(r['distanceKm'])} km · {'real road network (OSRM)' if r['roadLive'] else 'estimated'}"
        if key == "eta":
            return f"{format_eta(r['etaMin'])} transit{' · OSRM duration + traffic' if r['roadLive'] else ''}"
        if key == "traffic":
            return f"Corridor congestion {r['congestion'] * 100:.0f}%"
        if key == "weather":
            return (
                f"Live: {live_w['label']} near {live_w['near']} · Open-Meteo"
                if live_w
                else f"Seasonal weather risk {r['weatherRisk'] * 100:.0f}%"
            )
        if key == "toll":
            return f"{inr(r['tollsInr'])} in plazas"
        if key == "fuel":
            return f"{inr(r['fuelInr'])} diesel @ {fuel_eff:.2f} km/L"
        return f"{r['co2Kg']:.0f} kg CO₂ tailpipe"

    metric_keys = ("cost", "distance", "eta", "traffic", "weather", "toll", "fuel", "co2")
    labels = {
        "cost": "Cost",
        "distance": "Distance",
        "eta": "ETA",
        "traffic": "Traffic",
        "weather": "Weather",
        "toll": "Tolls",
        "fuel": "Fuel",
        "co2": "CO₂",
    }
    getters = {
        "cost": lambda r: r["costInr"],
        "distance": lambda r: r["distanceKm"],
        "eta": lambda r: r["etaMin"],
        "traffic": lambda r: r["congestion"],
        "weather": lambda r: r["weatherRisk"],
        "toll": lambda r: r["tollsInr"],
        "fuel": lambda r: r["fuelInr"],
        "co2": lambda r: r["co2Kg"],
    }

    mins = {key: min(getters[key](r) for r in rows) for key in metric_keys}

    def norm(v: float, lo: float) -> float:
        if v <= 0:
            return 1
        return clamp((lo / v) * 100, 1, 100)

    scored: list[tuple[dict[str, Any], float]] = []
    for r in rows:
        factors = []
        for key in metric_keys:
            normalized = norm(getters[key](r), mins[key])
            factors.append(
                {
                    "factor": labels[key],
                    "contribution": js_round(normalized * w[key] * 10) / 10,
                    "detail": metric_detail(r, key),
                }
            )
        total = js_round(sum(f["contribution"] for f in factors) * 10) / 10
        alt = {
            "id": r["def"].id,
            "label": r["def"].label,
            "summary": r["summary"],
            "distanceKm": r["distanceKm"],
            "etaMin": r["etaMin"],
            "costInr": js_round(r["costInr"]),
            "tollsInr": js_round(r["tollsInr"]),
            "fuelInr": js_round(r["fuelInr"]),
            "co2Kg": js_round(r["co2Kg"] * 10) / 10,
            "riskScore": r["riskScore"],
            "riskBand": r["riskBand"],
            "segments": r["segments"],
            "factors": factors,
            "dataStatus": "optimization",
            "roadLive": r["roadLive"],
        }
        scored.append((alt, total))

    recommended_index = 0
    for i, (_, score) in enumerate(scored):
        if score > scored[recommended_index][1]:
            recommended_index = i

    return {"alternatives": [alt for alt, _ in scored], "recommendedIndex": recommended_index}
