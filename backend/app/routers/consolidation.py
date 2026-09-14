"""Consolidation routes — threshold-driven groups + merge apply.

Port of src/app/api/consolidation/route.ts and
src/app/api/consolidation/apply/route.ts.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db, now_ms
from ..engines.consolidation import build_consolidation_groups, savings_for_group
from ..engines.validation import require_write
from ..errors import err, ok
from ..ids import new_id
from ..models import Notification, Shipment, ShipmentEvent
from ..schemas import ConsolidationApplyInput
from ..security import require_user
from ..thresholds import audit, get_org_thresholds

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/consolidation", tags=["consolidation"])


@router.get("")
def consolidation(db: OrmSession = Depends(get_db), user: Any = Depends(require_user)) -> Any:
    cfg = get_org_thresholds(db, user.orgId)
    t = cfg["values"]

    rows = (
        db.query(Shipment)
        .filter(Shipment.orgId == user.orgId, Shipment.status.in_(["scheduled", "draft"]))
        .order_by(Shipment.plannedDeparture.asc())
        .all()
    )

    groups = build_consolidation_groups(
        [
            {
                "id": s.id,
                "ref": s.ref,
                "client": s.client,
                "weightKg": s.weightKg,
                "volumeM3": s.volumeM3,
                "originCity": s.originCity,
                "destCity": s.destCity,
                "distanceKm": s.distanceKm,
                "costInr": s.costInr,
                "plannedDeparture": s.plannedDeparture,
                "status": s.status,
            }
            for s in rows
        ],
        t,
    )

    return ok(
        {
            "groups": groups,
            "meta": {"dataStatus": "rule_based", "configVersion": f"{cfg['version']}:{cfg['configHash']}"},
        }
    )


def _format_en_in(n: int) -> str:
    s = str(abs(int(n)))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups + [tail])
    return f"-{s}" if n < 0 else s


@router.post("/apply")
def consolidation_apply(
    payload: ConsolidationApplyInput,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    require_write(user)

    shipments = db.query(Shipment).filter(Shipment.orgId == user.orgId, Shipment.id.in_(payload.shipmentIds)).all()
    if len(shipments) != len(payload.shipmentIds):
        return err("NOT_FOUND", "One or more shipments were not found in your organization", 404)
    not_eligible = next((s for s in shipments if s.status not in ("scheduled", "draft")), None)
    if not_eligible is not None:
        return err("INVALID_TRANSITION", f"{not_eligible.ref} is {not_eligible.status} and cannot be consolidated", 409)

    costs = [s.costInr for s in shipments]
    savings_inr = savings_for_group(costs)["savingsInr"]
    savings_str = _format_en_in(savings_inr)

    ref = f"CONS-26-{str(now_ms())[-6:]}"
    now = now_ms()

    for s in shipments:
        s.routeLabel = f"Consolidated {ref}"
        db.add(
            ShipmentEvent(
                id=new_id(),
                shipmentId=s.id,
                type="Consolidated",
                note=f"Merged into consolidated load {ref} · est. savings ₹{savings_str}",
                city=s.originCity,
                at=now,
            )
        )
    db.add(
        Notification(
            id=new_id(),
            orgId=user.orgId,
            title="Loads consolidated",
            body=f"{len(shipments)} shipments merged into {ref} · estimated savings ₹{savings_str}",
            kind="consolidation",
        )
    )
    db.commit()

    audit(
        db,
        user.orgId,
        user.id,
        "consolidation.apply",
        f'{user.name} consolidated {", ".join(s.ref for s in shipments)} into {ref}',
    )
    db.commit()

    return ok({"ref": ref, "savingsInr": savings_inr})


__all__ = ["router"]
