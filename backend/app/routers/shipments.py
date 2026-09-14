"""Shipment routes — list / create / detail / assign / advance / suggestions."""
from __future__ import annotations

import json
import random
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db, iso_utc, now_ms
from ..domain import STATUS_MACHINE
from ..dto import to_assignable_vehicle, to_shipment_dto, with_driver_names
from ..engines.assignment import rank_vehicles
from ..engines.delay_risk import score_shipment_delay
from ..engines.rates import BILLING_INR_PER_KM
from ..engines.route_scoring import corridor_profile
from ..engines.validation import require_write
from ..errors import err, js_round, ok
from ..hubs import distance_km, hub
from ..ids import new_id
from ..live.routing import ROUTING_ATTRIBUTION, road_route
from ..live.weather import WEATHER_ATTRIBUTION, corridor_weather
from ..models import Driver, Notification, Shipment, ShipmentEvent, Vehicle
from ..schemas import AssignInput, CreateShipmentInput, ShipmentListQuery, validate_model
from ..security import require_user
from ..thresholds import audit, get_org_thresholds

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/shipments", tags=["shipments"])


# ---------------------------------------------------------------------------
# GET /api/shipments?status&q&page&pageSize
# ---------------------------------------------------------------------------


@router.get("")
def list_shipments(
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: str | None = Query(default=None),
    pageSize: str | None = Query(default=None),
) -> Any:
    parsed = validate_model(
        ShipmentListQuery,
        {k: v for k, v in {"status": status, "q": q, "page": page, "pageSize": pageSize}.items() if v is not None},
        "Invalid query parameters",
    )

    query = db.query(Shipment).filter(Shipment.orgId == user.orgId)
    if parsed["status"]:
        query = query.filter(Shipment.status == parsed["status"])
    rows = query.order_by(Shipment.createdAt.desc()).all()
    pairs = with_driver_names(db, rows)

    needle = (parsed["q"] or "").lower()
    if needle:
        pairs = [
            (s, d)
            for s, d in pairs
            if needle in s.ref.lower()
            or needle in s.client.lower()
            or needle in s.cargo.lower()
            or needle in s.originCity.lower()
            or needle in s.destCity.lower()
        ]

    total = len(pairs)
    start = (parsed["page"] - 1) * parsed["pageSize"]
    page_items = pairs[start : start + parsed["pageSize"]]
    items = [
        to_shipment_dto(s, vehicle_reg=s.assignedVehicle.regNo if s.assignedVehicle else None, driver_name=d)
        for s, d in page_items
    ]
    return ok({"items": items, "total": total, "page": parsed["page"], "pageSize": parsed["pageSize"]})


# ---------------------------------------------------------------------------
# POST /api/shipments — create with live road km / weather-aware risk
# ---------------------------------------------------------------------------


def _next_ref(count: int) -> str:
    return f"APA-26-{1001 + count}"


@router.post("", status_code=201)
async def create_shipment(
    payload: CreateShipmentInput,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    require_write(user)

    t = get_org_thresholds(db, user.orgId)["values"]
    o = hub(payload.originCity)
    d = hub(payload.destCity)

    # LIVE INPUTS (graceful fallback to the deterministic model)
    import asyncio

    weather, road = await asyncio.gather(
        corridor_weather({"city": o.city, "lat": o.lat, "lng": o.lng}, {"city": d.city, "lat": d.lat, "lng": d.lng}),
        road_route_with_deadline(db, o.lat, o.lng, d.lat, d.lng, deadline_ms=8000),
    )
    km = road["km"] if road else distance_km(o.lat, o.lng, d.lat, d.lng)
    km_stored = js_round(km)  # DB column is Int (Prisma parity)

    # Transit: real driving duration when live (decelerated for corridor
    # congestion) + 90 min fixed handling; else 55 km/h linehaul model.
    corridor = corridor_profile(payload.originCity, payload.destCity)
    if road:
        transit_min = road["durationMin"] * (1 + corridor.congestion * 0.3) + 90
    else:
        transit_min = (km / 55) * 60 + 90
    planned_departure = payload.plannedDeparture
    eta_ms = planned_departure + transit_min * 60_000
    slack_min = (eta_ms - now_ms()) / 60_000
    weather_risk = max(corridor.weather_risk, weather["risk"]) if weather else corridor.weather_risk
    risk = score_shipment_delay(
        slack_min=slack_min,
        corridor={"congestion": corridor.congestion, "weatherRisk": weather_risk},
        priority=payload.priority,
        vehicle_health=None,
        thresholds=t,
    )
    if weather:
        risk["factors"].insert(
            0,
            {
                "factor": "Live weather",
                "contribution": js_round(weather["risk"] * 25 * 10) / 10,
                "detail": f"{weather['label']} near {' / '.join(e['city'] for e in weather['ends'])} · Open-Meteo",
            },
        )

    count = db.query(Shipment).filter(Shipment.orgId == user.orgId).count()
    ref = _next_ref(count)
    while db.query(Shipment).filter(Shipment.orgId == user.orgId, Shipment.ref == ref).first() is not None:
        ref = f"APA-26-{1001 + random.randint(0, 8999)}"

    shipment = Shipment(
        id=new_id(),
        orgId=user.orgId,
        ref=ref,
        client=payload.client,
        cargo=payload.cargo,
        weightKg=payload.weightKg,
        volumeM3=payload.volumeM3,
        status="scheduled",
        priority=payload.priority,
        originCity=payload.originCity,
        originLat=o.lat,
        originLng=o.lng,
        destCity=payload.destCity,
        destLat=d.lat,
        destLng=d.lng,
        distanceKm=km_stored,
        plannedDeparture=planned_departure,
        etaAt=eta_ms,
        costInr=js_round(km * BILLING_INR_PER_KM),
        riskBand=risk["band"],
        riskScore=risk["score"],
        riskFactors=json.dumps(risk["factors"][:3], separators=(",", ":")),
        progress=0,
    )
    db.add(shipment)
    db.flush()

    db.add(
        ShipmentEvent(
            id=new_id(),
            shipmentId=shipment.id,
            type="Created",
            note=(
                f"Shipment created · {payload.cargo} · {payload.weightKg / 1000:.1f}t"
                + (f" · {km_stored} km via {ROUTING_ATTRIBUTION}" if road else "")
            ),
            city=payload.originCity,
        )
    )
    db.commit()

    sources: list[dict[str, str]] = []
    if road:
        sources.append({"name": ROUTING_ATTRIBUTION, "status": "live", "detail": f"{km_stored} km real road distance"})
    if weather:
        sources.append({"name": WEATHER_ATTRIBUTION, "status": "live", "detail": f"{weather['label']} on corridor"})
    return ok({"shipment": to_shipment_dto(shipment), "sources": sources}, 201)


async def road_route_with_deadline(
    db: OrmSession, a_lat: float, a_lng: float, b_lat: float, b_lng: float, *, deadline_ms: int
) -> dict[str, Any] | None:
    """Thin wrapper so the shared DB session is used for the RoadLeg cache."""
    return await road_route(db, a_lat, a_lng, b_lat, b_lng, deadline_ms=deadline_ms)


# ---------------------------------------------------------------------------
# GET /api/shipments/{id} — detail + event timeline
# ---------------------------------------------------------------------------


@router.get("/{shipment_id}")
def get_shipment(
    shipment_id: str,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    shipment = (
        db.query(Shipment).filter(Shipment.id == shipment_id, Shipment.orgId == user.orgId).first()
    )
    if shipment is None:
        return err("NOT_FOUND", "Shipment not found in your organization", 404)

    [(s, driver_name)] = with_driver_names(db, [shipment])
    events = db.query(ShipmentEvent).filter(ShipmentEvent.shipmentId == shipment.id).order_by(ShipmentEvent.at.asc()).all()

    event_dtos: list[dict[str, Any]] = []
    for e in events:
        dto: dict[str, Any] = {"id": e.id, "at": iso_utc(e.at), "type": e.type, "note": e.note}
        if e.city is not None:
            dto["city"] = e.city
        event_dtos.append(dto)

    return ok(
        {
            "shipment": to_shipment_dto(
                s,
                vehicle_reg=s.assignedVehicle.regNo if s.assignedVehicle else None,
                driver_name=driver_name,
            ),
            "events": event_dtos,
        }
    )


# ---------------------------------------------------------------------------
# POST /api/shipments/{id}/assign
# ---------------------------------------------------------------------------


@router.post("/{shipment_id}/assign")
def assign_shipment(
    shipment_id: str,
    payload: AssignInput,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    require_write(user)

    shipment = db.query(Shipment).filter(Shipment.id == shipment_id, Shipment.orgId == user.orgId).first()
    if shipment is None:
        return err("NOT_FOUND", "Shipment not found in your organization", 404)
    if shipment.status != "scheduled":
        return err("INVALID_TRANSITION", f'Cannot assign a shipment from status "{shipment.status}"', 409)

    vehicle = db.query(Vehicle).filter(Vehicle.id == payload.vehicleId, Vehicle.orgId == user.orgId).first()
    if vehicle is None:
        return err("NOT_FOUND", "Vehicle not found in your organization", 404)

    if vehicle.capacityKg < shipment.weightKg or vehicle.capacityM3 < shipment.volumeM3:
        return err(
            "CAPACITY_EXCEEDED",
            f"{vehicle.regNo} cannot carry this load",
            422,
            {
                "vehicle": vehicle.regNo,
                "capacityKg": vehicle.capacityKg,
                "requiredKg": shipment.weightKg,
                "capacityM3": vehicle.capacityM3,
                "requiredM3": shipment.volumeM3,
            },
        )
    if vehicle.status != "available":
        return err("VALIDATION", f"{vehicle.regNo} is not available (status: {vehicle.status})", 409)

    cfg = get_org_thresholds(db, user.orgId)
    t = cfg["values"]
    vehicles = db.query(Vehicle).filter(Vehicle.orgId == user.orgId).all()
    in_use = sum(1 for v in vehicles if v.status == "in_use")
    ranked = rank_vehicles(
        {
            "weightKg": shipment.weightKg,
            "volumeM3": shipment.volumeM3,
            "originCity": shipment.originCity,
            "originLat": shipment.originLat,
            "originLng": shipment.originLng,
            "distanceKm": shipment.distanceKm,
        },
        [to_assignable_vehicle(vehicle)],
        t,
        {"fleetUtilizationPct": (in_use / len(vehicles)) * 100 if vehicles else 0},
    )
    best = ranked[0] if ranked else {"score": 50, "breakdown": []}
    reasons = [f"{b['factor']}: {b['detail']}" for b in best["breakdown"][:4]]
    vehicle_dto = to_assignable_vehicle(vehicle)

    # Reserve an available driver so the load rolls with a crew.
    driver = (
        db.query(Driver).filter(Driver.orgId == user.orgId, Driver.status == "available").order_by(Driver.rating.desc()).first()
    )

    shipment.status = "assigned"
    shipment.assignedVehicleId = vehicle.id
    shipment.assignedDriverId = driver.id if driver else None
    shipment.progress = 5
    vehicle.status = "in_use"
    if driver is not None:
        driver.status = "on_duty"

    db.add(
        ShipmentEvent(
            id=new_id(),
            shipmentId=shipment.id,
            type="Assigned",
            note=f"Assigned to {vehicle.regNo}" + (f" · Driver {driver.name}" if driver else ""),
            city=shipment.originCity,
        )
    )
    db.add(
        Notification(
            id=new_id(),
            orgId=user.orgId,
            title="Vehicle assigned",
            body=f"{shipment.ref} → {vehicle.regNo} ({vehicle_dto['typeLabel']}) · score {best['score']}",
            kind="assignment",
        )
    )
    db.commit()

    audit(db, user.orgId, user.id, "shipment.assign", f"{user.name} assigned {vehicle.regNo} to {shipment.ref}")
    db.commit()

    return ok({"score": best["score"], "reasons": reasons})


# ---------------------------------------------------------------------------
# POST /api/shipments/{id}/advance — status machine
# ---------------------------------------------------------------------------

#: Forward step for each status (advance always moves the load ahead).
FORWARD: dict[str, str] = {
    "draft": "scheduled",
    "scheduled": "assigned",
    "assigned": "in_transit",
    "in_transit": "delivered",
}

_PROGRESS_MAP: dict[str, int] = {"scheduled": 0, "assigned": 5, "in_transit": 35, "delivered": 100}


@router.post("/{shipment_id}/advance")
def advance_shipment(
    shipment_id: str,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    require_write(user)

    shipment = db.query(Shipment).filter(Shipment.id == shipment_id, Shipment.orgId == user.orgId).first()
    if shipment is None:
        return err("NOT_FOUND", "Shipment not found in your organization", 404)

    current = shipment.status
    nxt = FORWARD.get(current)
    if nxt is None or nxt not in STATUS_MACHINE.get(current, ()):
        return err("INVALID_TRANSITION", f'Cannot advance a shipment from status "{current}"', 409)

    event_specs: dict[str, dict[str, str]] = {
        "scheduled": {"type": "Scheduled", "note": "Scheduled for departure", "city": shipment.originCity},
        "assigned": {"type": "Assigned", "note": "Marked assigned — vehicle slot confirmed", "city": shipment.originCity},
        "in_transit": {"type": "Departed", "note": f"Departed {shipment.originCity}", "city": shipment.originCity},
        "delivered": {"type": "Delivered", "note": f"Delivered at {shipment.destCity}", "city": shipment.destCity},
    }

    shipment.status = nxt
    shipment.progress = _PROGRESS_MAP.get(nxt, shipment.progress)

    spec = event_specs[nxt]
    db.add(ShipmentEvent(id=new_id(), shipmentId=shipment.id, type=spec["type"], note=spec["note"], city=spec["city"]))

    # Delivered: release the vehicle + driver back to the fleet.
    if nxt == "delivered":
        if shipment.assignedVehicleId:
            v = db.get(Vehicle, shipment.assignedVehicleId)
            if v is not None:
                v.status = "available"
        if shipment.assignedDriverId:
            drv = db.get(Driver, shipment.assignedDriverId)
            if drv is not None:
                drv.status = "available"

    db.commit()
    return ok({"status": nxt})


# ---------------------------------------------------------------------------
# GET /api/shipments/{id}/suggestions
# ---------------------------------------------------------------------------


@router.get("/{shipment_id}/suggestions")
def suggestions(
    shipment_id: str,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    shipment = db.query(Shipment).filter(Shipment.id == shipment_id, Shipment.orgId == user.orgId).first()
    if shipment is None:
        return err("NOT_FOUND", "Shipment not found in your organization", 404)

    cfg = get_org_thresholds(db, user.orgId)
    t = cfg["values"]

    vehicles = db.query(Vehicle).filter(Vehicle.orgId == user.orgId).all()
    # Rank only assignable units: available preferred, maintenance never.
    available_pool = [v for v in vehicles if v.status == "available"]
    rank_pool = available_pool if available_pool else [v for v in vehicles if v.status != "maintenance"]
    in_use = sum(1 for v in vehicles if v.status == "in_use")
    fleet_utilization_pct = (in_use / len(vehicles)) * 100 if vehicles else 0

    ranked = rank_vehicles(
        {
            "weightKg": shipment.weightKg,
            "volumeM3": shipment.volumeM3,
            "originCity": shipment.originCity,
            "originLat": shipment.originLat,
            "originLng": shipment.originLng,
            "distanceKm": shipment.distanceKm,
        },
        [to_assignable_vehicle(v) for v in rank_pool],
        t,
        {"fleetUtilizationPct": fleet_utilization_pct},
    )

    return ok(
        {
            "suggestions": [
                {"vehicle": r["vehicle"], "score": r["score"], "breakdown": r["breakdown"]} for r in ranked
            ],
            "shipment": to_shipment_dto(shipment),
            "meta": {"dataStatus": "rule_based", "configVersion": f"{cfg['version']}:{cfg['configHash']}"},
        }
    )

