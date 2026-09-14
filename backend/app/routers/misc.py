"""Misc routes — demo request (public), live conditions (public), health, root.

Port of src/app/api/demo-request/route.ts, src/app/api/live/conditions/route.ts,
src/app/api/health/route.ts and src/app/api/route.ts.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db
from ..errors import ok
from ..hubs import hub
from ..ids import new_id
from ..live.weather import WEATHER_ATTRIBUTION, WEATHER_SOURCE_URL, fetch_hubs_weather
from ..models import DemoRequest
from ..schemas import DemoRequestInput

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, tags=["misc"])


@router.post("/api/demo-request", status_code=201)
def demo_request(
    payload: DemoRequestInput,
    db: OrmSession = Depends(get_db),
) -> Any:
    # The pydantic model already enforces the zod rules; re-validating with
    # validate_model produces the exact TS error envelope when violated.
    from ..schemas import validate_model

    validate_model(DemoRequestInput, payload.model_dump(), "Please fill name, work email, organization and fleet size")
    db.add(
        DemoRequest(
            id=new_id(),
            name=payload.name,
            email=payload.email,
            org=payload.org,
            fleetSize=payload.fleetSize,
            message=payload.message or "",
        )
    )
    db.commit()
    return ok({"ok": True}, 201)


_SHOWCASE = ["Mumbai", "Delhi", "Bengaluru", "Kolkata"]


@router.get("/api/live/conditions")
async def live_conditions() -> Any:
    try:
        hubs = [hub(c) for c in _SHOWCASE]
        weather = await fetch_hubs_weather([{"city": h.city, "lat": h.lat, "lng": h.lng} for h in hubs])
        return ok(
            {
                "hubs": [
                    {
                        "city": w.city,
                        "tempC": w.tempC,
                        "label": w.label,
                        "precipMm": w.precipMm,
                        "risk": w.risk,
                    }
                    for w in weather
                ],
                "source": {"name": WEATHER_ATTRIBUTION, "status": "live", "url": WEATHER_SOURCE_URL},
            }
        )
    except Exception:  # noqa: BLE001 — TS catch → degraded but-200 payload
        return ok(
            {
                "hubs": [],
                "source": {"name": WEATHER_ATTRIBUTION, "status": "rule_based", "url": WEATHER_SOURCE_URL},
            }
        )


@router.get("/api/health")
def health(db: OrmSession = Depends(get_db)) -> Any:
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 — health must report, not raise
        db_ok = False
    return ok({"ok": db_ok, "db": db_ok}, 200 if db_ok else 500)


@router.get("/api")
def api_root() -> Any:
    return ok({"message": "Hello, world!"})


__all__ = ["router"]
