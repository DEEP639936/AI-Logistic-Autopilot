"""Return-load routes — backhaul matching + accept.

Port of src/app/api/return-loads/route.ts and
src/app/api/return-loads/accept/route.ts.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..domain import type_label_for
from ..engines.return_load import find_return_loads, parse_match_id
from ..engines.validation import require_write
from ..errors import err, ok
from ..ids import new_id
from ..models import Driver, Notification, Shipment, ShipmentEvent, Vehicle
from ..schemas import AcceptReturnInput
from ..security import require_user
from ..thresholds import audit, get_org_thresholds

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/return-loads", tags=["return-loads"])


@router.get("")
def return_loads(db: OrmSession = Depends(get_db), user: Any = Depends(require_user)) -> Any:
    cfg = get_org_thresholds(db, user.orgId)
    t = cfg["values"]

    vehicle_rows = db.query(Vehicle).filter(Vehicle.orgId == user.orgId).all()
    shipment_rows = (
        db.query(Shipment)
        .filter(Shipment.orgId == user.orgId, Shipment.status == "scheduled")
        .order_by(Shipment.plannedDeparture.asc())
        .all()
    )

    matches = find_return_loads(
        [
            {
                "id": v.id,
                "regNo": v.regNo,
                "typeLabel": type_label_for(v.type),
                "capacityKg": v.capacityKg,
                "status": v.status,
                "currentCity": v.currentCity,
                "lat": v.lat,
                "lng": v.lng,
            }
            for v in vehicle_rows
        ],
        [
            {
                "id": s.id,
                "ref": s.ref,
                "client": s.client,
                "cargo": s.cargo,
                "weightKg": s.weightKg,
                "originCity": s.originCity,
                "originLat": s.originLat,
                "originLng": s.originLng,
                "destCity": s.destCity,
                "distanceKm": s.distanceKm,
                "status": s.status,
            }
            for s in shipment_rows
        ],
        t,
    )

    return ok(
        {
            "matches": matches,
            "meta": {"dataStatus": "rule_based", "configVersion": f"{cfg['version']}:{cfg['configHash']}"},
        }
    )


@router.post("/accept")
def accept_return_load(
    payload: AcceptReturnInput,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    require_write(user)

    ids = parse_match_id(payload.matchId)
    if ids is None:
        return err("VALIDATION", "matchId must be of the form <vehicleId>:<shipmentId>", 400)

    vehicle = db.query(Vehicle).filter(Vehicle.id == ids["vehicleId"], Vehicle.orgId == user.orgId).first()
    shipment = db.query(Shipment).filter(Shipment.id == ids["shipmentId"], Shipment.orgId == user.orgId).first()
    if vehicle is None:
        return err("NOT_FOUND", "Vehicle not found in your organization", 404)
    if shipment is None:
        return err("NOT_FOUND", "Shipment not found in your organization", 404)
    if shipment.status != "scheduled":
        return err("INVALID_TRANSITION", f"{shipment.ref} is {shipment.status} and can no longer be picked up", 409)
    if vehicle.status != "available":
        return err("VALIDATION", f"{vehicle.regNo} is not available (status: {vehicle.status})", 409)
    if vehicle.capacityKg < shipment.weightKg or vehicle.capacityM3 < shipment.volumeM3:
        return err("CAPACITY_EXCEEDED", f"{vehicle.regNo} cannot carry this load", 422)

    driver = (
        db.query(Driver)
        .filter(Driver.orgId == user.orgId, Driver.status == "available")
        .order_by(Driver.rating.desc())
        .first()
    )

    shipment.status = "assigned"
    shipment.assignedVehicleId = vehicle.id
    shipment.assignedDriverId = driver.id if driver is not None else None
    shipment.routeLabel = f"Backhaul via {shipment.originCity}"
    shipment.progress = 5
    vehicle.status = "in_use"
    if driver is not None:
        driver.status = "on_duty"

    db.add(
        ShipmentEvent(
            id=new_id(),
            shipmentId=shipment.id,
            type="Assigned",
            note=f"Return load accepted · {vehicle.regNo} repositioning from {vehicle.currentCity}",
            city=shipment.originCity,
        )
    )
    db.add(
        Notification(
            id=new_id(),
            orgId=user.orgId,
            title="Return load accepted",
            body=f"{vehicle.regNo} → {shipment.ref} ({shipment.originCity} → {shipment.destCity})",
            kind="assignment",
        )
    )
    db.commit()

    audit(db, user.orgId, user.id, "return_load.accept", f"{user.name} accepted return load {shipment.ref} for {vehicle.regNo}")
    db.commit()

    return ok({"ok": True})


__all__ = ["router"]
