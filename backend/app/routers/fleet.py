"""Fleet route — vehicles, drivers, summary, predictive maintenance flags."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..dto import to_driver_dto, to_vehicle_dto
from ..engines.maintenance import maintenance_flags
from ..errors import js_round, ok
from ..models import Driver, Shipment, Vehicle
from ..security import require_user
from ..thresholds import get_org_thresholds

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/fleet", tags=["fleet"])


@router.get("")
def fleet(db: OrmSession = Depends(get_db), user: Any = Depends(require_user)) -> Any:
    cfg = get_org_thresholds(db, user.orgId)
    t = cfg["values"]

    vehicle_rows = db.query(Vehicle).filter(Vehicle.orgId == user.orgId).order_by(Vehicle.regNo.asc()).all()
    driver_rows = db.query(Driver).filter(Driver.orgId == user.orgId).order_by(Driver.name.asc()).all()

    active = (
        db.query(Shipment.assignedVehicleId, Shipment.ref)
        .filter(
            Shipment.orgId == user.orgId,
            Shipment.status.in_(["assigned", "in_transit"]),
            Shipment.assignedVehicleId.isnot(None),
        )
        .all()
    )
    ref_by_vehicle = {row.assignedVehicleId: row.ref for row in active}

    vehicles = [to_vehicle_dto(v, current_shipment_ref=ref_by_vehicle.get(v.id)) for v in vehicle_rows]
    drivers = [to_driver_dto(d) for d in driver_rows]

    available = sum(1 for v in vehicle_rows if v.status == "available")
    in_use = sum(1 for v in vehicle_rows if v.status == "in_use")
    maintenance = sum(1 for v in vehicle_rows if v.status == "maintenance")
    total = len(vehicle_rows) or 1

    return ok(
        {
            "vehicles": vehicles,
            "drivers": drivers,
            "summary": {
                "available": available,
                "inUse": in_use,
                "maintenance": maintenance,
                "utilizationPct": js_round((in_use / total) * 100),
            },
            "maintenanceFlags": maintenance_flags(
                [
                    {
                        "id": v.id,
                        "regNo": v.regNo,
                        "odometerKm": v.odometerKm,
                        "lastServiceOdometerKm": v.lastServiceOdometerKm,
                        "healthScore": v.healthScore,
                        "fuelEffKmpl": v.fuelEffKmpl,
                    }
                    for v in vehicle_rows
                ],
                t,
            ),
            "meta": {"dataStatus": "demo", "configVersion": f"{cfg['version']}:{cfg['configHash']}"},
        }
    )
