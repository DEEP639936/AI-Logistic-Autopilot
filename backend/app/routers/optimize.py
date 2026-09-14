"""Route optimization route — 3 corridor alternatives with live inputs.

Port of src/app/api/routes/optimize/route.ts.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..dto import to_shipment_dto
from ..engines.route_scoring import optimize_route, pick_intermediate_hub
from ..errors import err, ok
from ..hubs import has_hub, hub
from ..live.routing import ROUTING_ATTRIBUTION, ROUTING_SOURCE_URL, road_legs_by_rank
from ..live.weather import WEATHER_ATTRIBUTION, WEATHER_SOURCE_URL, corridor_weather
from ..models import Shipment
from ..schemas import OptimizeInput, validate_model
from ..security import require_user
from ..thresholds import get_org_thresholds

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/routes", tags=["routes"])


@router.post("/optimize")
async def optimize(
    payload: OptimizeInput,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    origin_city = payload.originCity
    dest_city = payload.destCity
    weight_kg = payload.weightKg
    cargo_type = payload.cargoType
    shipment_dto: dict[str, Any] | None = None

    if payload.shipmentId:
        shipment = db.query(Shipment).filter(Shipment.id == payload.shipmentId, Shipment.orgId == user.orgId).first()
        if shipment is None:
            return err("NOT_FOUND", "Shipment not found in your organization", 404)
        origin_city = shipment.originCity
        dest_city = shipment.destCity
        weight_kg = shipment.weightKg
        cargo_type = shipment.cargo
        shipment_dto = to_shipment_dto(shipment)

    if not origin_city or not dest_city or not weight_kg or not cargo_type:
        # zod refine on optimizeSchema — fires before the individual checks.
        return err(
            "VALIDATION",
            "Invalid optimize payload",
            400,
            [{"path": "", "message": "Provide shipmentId or originCity + destCity + weightKg + cargoType"}],
        )
    if not has_hub(origin_city):
        return err("INVALID_HUB", f"Unknown hub: {origin_city}", 422)
    if not has_hub(dest_city):
        return err("INVALID_HUB", f"Unknown hub: {dest_city}", 422)
    o = hub(origin_city)
    d = hub(dest_city)

    cfg = get_org_thresholds(db, user.orgId)
    t = cfg["values"]

    # ---------- LIVE INPUTS (degrade gracefully to model estimates) ----------
    mids = [hub(pick_intermediate_hub(origin_city, dest_city, rank)) for rank in (0, 1, 2)]
    weather, legs_by_rank = await _gather_live(
        db, o, d, [{"lat": m.lat, "lng": m.lng} for m in mids]
    )

    result = optimize_route(
        origin_city=origin_city,
        dest_city=dest_city,
        weight_kg=weight_kg,
        cargo_type=cargo_type,
        thresholds=t,
        live={
            "legsByRank": legs_by_rank,
            "weather": (
                {"risk": weather["risk"], "label": weather["label"], "near": weather["ends"][0]["city"] if weather["ends"] else origin_city}
                if weather
                else None
            ),
        },
    )

    any_rank_full = any(all(leg is not None for leg in legs) for legs in legs_by_rank)
    any_leg = any(any(leg is not None for leg in legs) for legs in legs_by_rank)

    sources: list[dict[str, str]] = [
        {
            "name": ROUTING_ATTRIBUTION,
            "status": "live" if any_rank_full else "rule_based",
            "url": ROUTING_SOURCE_URL,
            "detail": "True road distances & driving durations for every corridor leg",
        },
        {
            "name": WEATHER_ATTRIBUTION,
            "status": "live" if weather else "rule_based",
            "url": WEATHER_SOURCE_URL,
            "detail": (
                f"Now: {weather['label']} near {' / '.join(e['city'] for e in weather['ends'])}"
                if weather
                else "Seasonal profile (live feed unavailable)"
            ),
        },
    ]

    body: dict[str, Any] = {
        "alternatives": result["alternatives"],
        "recommendedIndex": result["recommendedIndex"],
        "live": {
            "roads": any_leg,
            "weather": (
                {"label": weather["label"], "risk": weather["risk"], "ends": weather["ends"]}
                if weather
                else None
            ),
        },
        "sources": sources,
        "meta": {"dataStatus": "optimization", "configVersion": f"{cfg['version']}:{cfg['configHash']}"},
    }
    if shipment_dto is not None:
        # TS JSON.stringify drops the undefined key entirely when no shipmentId.
        body["shipment"] = shipment_dto
    return ok(body)


async def _gather_live(
    db: OrmSession,
    o: Any,
    d: Any,
    mids: list[dict[str, float]],
) -> tuple[dict[str, Any] | None, list[list[dict[str, int | float] | None]]]:
    """Promise.all equivalent: corridor weather + per-rank road legs."""
    import asyncio

    weather, legs_by_rank = await asyncio.gather(
        corridor_weather({"city": o.city, "lat": o.lat, "lng": o.lng}, {"city": d.city, "lat": d.lat, "lng": d.lng}),
        road_legs_by_rank(db, {"lat": o.lat, "lng": o.lng}, mids, {"lat": d.lat, "lng": d.lng}, deadline_ms=9000),
    )
    return weather, legs_by_rank


__all__ = ["router"]
