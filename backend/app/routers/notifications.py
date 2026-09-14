"""Notification routes — list + mark-read.

Port of src/app/api/notifications/route.ts and
src/app/api/notifications/read/route.ts. `read` is emitted as a real JSON
boolean (Prisma stores a Bool; the Python model keeps an 0/1 integer).
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db, iso_utc
from ..errors import err, ok
from ..models import Notification
from ..schemas import NotificationsReadInput
from ..security import require_user

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/notifications", tags=["notifications"])


@router.get("")
def notifications(
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
    take: str | None = None,
) -> Any:
    try:
        take_n = min(int(take) if take else 20, 50)
    except ValueError:
        take_n = 20

    items = (
        db.query(Notification)
        .filter(Notification.orgId == user.orgId)
        .order_by(Notification.createdAt.desc())
        .limit(take_n)
        .all()
    )
    unread = db.query(Notification).filter(Notification.orgId == user.orgId, Notification.read == 0).count()

    return ok(
        {
            "items": [
                {
                    "id": n.id,
                    "title": n.title,
                    "body": n.body,
                    "kind": n.kind,
                    "read": bool(n.read),
                    "createdAt": iso_utc(n.createdAt),
                }
                for n in items
            ],
            "unread": unread,
        }
    )


@router.post("/read")
def mark_read(
    payload: NotificationsReadInput,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    if payload.all:
        rows = db.query(Notification).filter(Notification.orgId == user.orgId, Notification.read == 0).all()
        for n in rows:
            n.read = 1
        db.commit()
        return Response(status_code=204)
    if payload.ids:
        rows = db.query(Notification).filter(Notification.orgId == user.orgId, Notification.id.in_(payload.ids)).all()
        for n in rows:
            n.read = 1
        db.commit()
        return Response(status_code=204)
    from ..errors import err

    return err("VALIDATION", "Provide ids[] or all:true", 400)


__all__ = ["router"]
