"""Recommendation decide route — approve/reject with audit trail.

Port of src/app/api/recommendations/[id]/decide/route.ts.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db, now_ms
from ..errors import err, ok
from ..ids import new_id
from ..models import Notification, Recommendation
from ..security import require_user
from ..thresholds import audit

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/recommendations", tags=["recommendations"])


class DecideInput(BaseModel):
    action: str


@router.post("/{recommendation_id}/decide")
def decide_recommendation(
    recommendation_id: str,
    payload: DecideInput,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    if user.role not in ("ORG_ADMIN", "OPS_MANAGER", "DISPATCHER", "FLEET_MANAGER"):
        return err("FORBIDDEN", "Your role is read-only", 403)
    if payload.action not in ("approve", "reject"):
        return err("VALIDATION", "action must be approve or reject", 400)

    rec = db.query(Recommendation).filter(Recommendation.id == recommendation_id, Recommendation.orgId == user.orgId).first()
    if rec is None:
        return err("NOT_FOUND", "Recommendation not found in your organization", 404)
    if rec.status != "pending":
        return err("VALIDATION", f"Already {rec.status}", 409)

    rec.status = "approved" if payload.action == "approve" else "rejected"
    rec.decidedAt = now_ms()

    approved = payload.action == "approve"
    db.add(
        Notification(
            id=new_id(),
            orgId=user.orgId,
            title=f'Recommendation {payload.action + ("d" if approved else "ed")} · {rec.title[:48]}',
            body=(
                f"{user.name} approved the {rec.type} recommendation (confidence {rec.confidence * 100:.0f}%). "
                "Execution queued on the labelled demo workflow."
            )
            if approved
            else (
                f"{user.name} rejected the {rec.type} recommendation. "
                "Feedback recorded for threshold tuning."
            ),
            kind="recommendation",
        )
    )
    db.commit()

    verb = f"{payload.action}d"  # TS parity: `${raw.action}d` → "approved" / "rejectd"
    audit(db, user.orgId, user.id, f"recommendation.{payload.action}", f'{user.name} {verb} "{rec.title}" (confidence {rec.confidence})')
    db.commit()

    return ok({"id": rec.id, "status": rec.status})


__all__ = ["router"]
