"""Response DTO builders — port of `src/lib/ai/dto.ts`.

Every builder emits camelCase keys matching the frontend client contract in
`src/lib/api.ts` exactly. DateTime fields are formatted exactly like JS
`Date.toISOString()` (millisecond precision, trailing Z).
"""
from __future__ import annotations

import json
from typing import Any

from .database import iso_utc
from .domain import type_label_for
from .models import Driver, Shipment, Vehicle


# ---------------------------------------------------------------------------
# JSON string column parsing (riskFactors / reasons / steps / log / impact)
# ---------------------------------------------------------------------------


def parse_risk_factors(raw: str | None) -> list[dict[str, Any]]:
    return parse_json_array(raw)


def parse_json_array(raw: str | None) -> list[Any]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return []
    return parsed if isinstance(parsed, list) else []


def parse_json_object(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


# ---------------------------------------------------------------------------
# Shipment
# ---------------------------------------------------------------------------


def to_shipment_dto(
    s: Shipment,
    vehicle_reg: str | None = None,
    driver_name: str | None = None,
) -> dict[str, Any]:
    """ShipmentDTO — mirrors toShipmentDTO in dto.ts (camelCase, ISO dates)."""
    return {
        "id": s.id,
        "ref": s.ref,
        "client": s.client,
        "cargo": s.cargo,
        "weightKg": s.weightKg,
        "volumeM3": s.volumeM3,
        "status": s.status,
        "priority": s.priority,
        "originCity": s.originCity,
        "originLat": s.originLat,
        "originLng": s.originLng,
        "destCity": s.destCity,
        "destLat": s.destLat,
        "destLng": s.destLng,
        "distanceKm": s.distanceKm,
        "plannedDeparture": iso_utc(s.plannedDeparture),
        "etaAt": iso_utc(s.etaAt),
        "assignedVehicleId": s.assignedVehicleId,
        "assignedDriverId": s.assignedDriverId,
        "vehicleReg": vehicle_reg,
        "driverName": driver_name,
        "costInr": s.costInr,
        "riskBand": s.riskBand,
        "riskScore": s.riskScore,
        "riskFactors": parse_risk_factors(s.riskFactors),
        "progress": s.progress,
        "routeLabel": s.routeLabel,
        "createdAt": iso_utc(s.createdAt),
    }


def with_driver_names(db: Any, rows: list[Shipment]) -> list[tuple[Shipment, str | None]]:
    """Batch-resolve driver names for shipment rows (assignedDriverId is a plain FK).

    Returns (row, driverName) pairs, mirroring withDriverNames in dto.ts.
    """
    ids = {r.assignedDriverId for r in rows if r.assignedDriverId}
    name_by_id: dict[str, str] = {}
    if ids:
        drivers = db.query(Driver.id, Driver.name).filter(Driver.id.in_(ids)).all()  # type: ignore[attr-defined]
        name_by_id = {d.id: d.name for d in drivers if d.name}
    return [(r, name_by_id.get(r.assignedDriverId) if r.assignedDriverId else None) for r in rows]


# ---------------------------------------------------------------------------
# Fleet
# ---------------------------------------------------------------------------


def to_vehicle_dto(v: Vehicle, current_shipment_ref: str | None = None) -> dict[str, Any]:
    """VehicleDTO (adds typeLabel + currentShipmentRef)."""
    return {
        "id": v.id,
        "regNo": v.regNo,
        "type": v.type,
        "typeLabel": type_label_for(v.type),
        "capacityKg": v.capacityKg,
        "capacityM3": v.capacityM3,
        "status": v.status,
        "healthScore": v.healthScore,
        "odometerKm": v.odometerKm,
        "lastServiceOdometerKm": v.lastServiceOdometerKm,
        "fuelEffKmpl": v.fuelEffKmpl,
        "currentCity": v.currentCity,
        "lat": v.lat,
        "lng": v.lng,
        "currentShipmentRef": current_shipment_ref,
    }


def to_assignable_vehicle(v: Vehicle) -> dict[str, Any]:
    """Engine-facing vehicle shape (adds typeLabel) — mirrors toAssignableVehicle."""
    return {
        "id": v.id,
        "regNo": v.regNo,
        "type": v.type,
        "typeLabel": type_label_for(v.type),
        "capacityKg": v.capacityKg,
        "capacityM3": v.capacityM3,
        "status": v.status,
        "healthScore": v.healthScore,
        "currentCity": v.currentCity,
        "lat": v.lat,
        "lng": v.lng,
    }


def to_driver_dto(d: Driver) -> dict[str, Any]:
    return {
        "id": d.id,
        "name": d.name,
        "phone": d.phone,
        "licenseNo": d.licenseNo,
        "status": d.status,
        "hoursToday": d.hoursToday,
        "rating": d.rating,
        "trips": d.trips,
        "onTimePct": d.onTimePct,
    }
