"""Auth routes — register / login / logout / me.

Port of src/app/api/auth/* route handlers. The register endpoint provisions a
labelled starter fleet (8 vehicles · 6 drivers · 12 shipments) so a fresh
signup can explore the full product immediately.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db, now_ms
from ..domain import VEHICLE_TYPES
from ..errors import err, ok
from ..hubs import CORRIDORS, distance_km, hub
from ..ids import new_id
from ..models import Driver, Notification, Organization, Shipment, ShipmentEvent, ThresholdConfig, User, Vehicle
from ..schemas import LoginInput, RegisterInput
from ..security import (
    clear_session_cookie,
    create_session,
    destroy_session,
    hash_password,
    require_user,
    set_session_cookie,
    verify_password,
)
from ..thresholds import config_hash, default_thresholds

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/auth", tags=["auth"])

MIN = 60_000
HOUR = 60 * MIN

CLIENTS = ["Sri Traders", "Metro Mart", "Gujarat Polymers", "Kisan Agro", "UrbanNest Retail"]
CARGO = ["FMCG pallets", "Packaged foods", "Auto components", "E-commerce parcels", "Textile rolls"]
STATE_CODES = ["MH", "KA", "DL", "TN", "GJ", "TS"]


def slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:28] or "org"
    suffix = format(time.time() * 1000, "x")[-4:]
    return f"{base}-{suffix}"


def _session_user(user: User, org: Organization) -> dict[str, Any]:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "orgId": user.orgId,
        "orgName": org.name,
        "orgDemo": bool(org.demo),
    }


def provision_starter_data(db: OrmSession, org_id: str) -> None:
    """Port of provisionStarterData in src/app/api/auth/register/route.ts."""
    now = now_ms()

    for i in range(8):
        vtype = VEHICLE_TYPES[i % len(VEHICLE_TYPES)]
        city = hub(CORRIDORS[i % len(CORRIDORS)].from_city)
        odo = 60_000 + i * 21_000
        db.add(
            Vehicle(
                id=new_id(),
                orgId=org_id,
                regNo=f"{STATE_CODES[i % len(STATE_CODES)]} {11 + i} AP {4000 + i * 311}",
                type=vtype.id,
                capacityKg=vtype.capacityKg,
                capacityM3=vtype.capacityM3,
                status="available",
                healthScore=74 + ((i * 7) % 24),
                odometerKm=odo,
                lastServiceOdometerKm=odo - (6_000 + i * 2_300),
                fuelEffKmpl=3.1,
                currentCity=city.city,
                lat=city.lat,
                lng=city.lng,
            )
        )

    names = ["Ramesh Kumar", "Sai Reddy", "Vikram Singh", "Anil Patil", "Manoj Das", "Suresh Rao"]
    for i, name in enumerate(names):
        db.add(
            Driver(
                id=new_id(),
                orgId=org_id,
                name=name,
                phone=f"+91 9{8000000 + i * 111111} {str(10000 + i * 7)[:5]}",
                licenseNo=f"{STATE_CODES[i % len(STATE_CODES)]}{20 + i}2022000{1000 + i}",
                status="available",
                hoursToday=3 + i,
                rating=4.4,
                trips=210 + i * 40,
                onTimePct=90 + (i % 6),
            )
        )

    for i in range(12):
        c = CORRIDORS[i % len(CORRIDORS)]
        forward = i % 2 == 0
        from_name, to_name = (c.from_city, c.to_city) if forward else (c.to_city, c.from_city)
        o, d = hub(from_name), hub(to_name)
        km = distance_km(o.lat, o.lng, d.lat, d.lng)
        vtype = VEHICLE_TYPES[i % len(VEHICLE_TYPES)]
        status = "scheduled" if i < 8 else ("in_transit" if i < 10 else "delivered")
        depart_ms = now - (i + 1) * 20 * HOUR if status == "delivered" else now + (i + 1) * 8 * HOUR
        eta_ms = depart_ms + ((km / 55) * 60 + 90) * MIN
        weight_kg = round(vtype.capacityKg * (0.45 + (i % 4) * 0.12))
        shipment = Shipment(
            id=new_id(),
            orgId=org_id,
            ref=f"APA-26-{2001 + i}",
            client=CLIENTS[i % len(CLIENTS)],
            cargo=CARGO[i % len(CARGO)],
            weightKg=weight_kg,
            volumeM3=round(vtype.capacityM3 * 0.6 * 10) / 10,
            status=status,
            priority="priority" if i % 5 == 0 else "standard",
            originCity=o.city,
            originLat=o.lat,
            originLng=o.lng,
            destCity=d.city,
            destLat=d.lat,
            destLng=d.lng,
            distanceKm=km,
            plannedDeparture=depart_ms,
            etaAt=eta_ms,
            costInr=round(km * 112),
            riskBand="low",
            riskScore=12 + (i % 5) * 6,
            riskFactors='[{"factor":"Schedule slack","contribution":12,"detail":"Comfortable ETA buffer"}]',
            progress=100 if status == "delivered" else (40 + i if status == "in_transit" else 0),
            createdAt=depart_ms - 10 * HOUR,
        )
        db.add(shipment)
        db.add(
            ShipmentEvent(
                id=new_id(),
                shipmentId=shipment.id,
                at=depart_ms - 10 * HOUR,
                type="Created",
                note=f"Shipment booked · {weight_kg / 1000:.1f}t",
                city=o.city,
            )
        )

    db.add(
        Notification(
            id=new_id(),
            orgId=org_id,
            title="Welcome to Logistics Autopilot",
            body=(
                "Your workspace is provisioned with a labelled demo fleet (8 vehicles · 12 shipments) "
                "so you can explore every workflow. Replace it with real data whenever you're ready."
            ),
            kind="info",
        )
    )

    defaults = default_thresholds()
    db.add(
        ThresholdConfig(
            id=new_id(),
            orgId=org_id,
            json=json.dumps(defaults, separators=(",", ":")),
            version=1,
            configHash=config_hash(defaults),
            updatedBy="system",
        )
    )


@router.post("/register", status_code=200)
def register(payload: RegisterInput, response: Response, db: OrmSession = Depends(get_db)) -> Any:
    existing = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if existing is not None:
        return err("EMAIL_TAKEN", "An account with this email already exists", 409)

    org = Organization(id=new_id(), name=payload.orgName, slug=slugify(payload.orgName), plan="growth", demo=1)
    db.add(org)
    db.flush()
    user = User(
        id=new_id(),
        orgId=org.id,
        name=payload.name,
        email=payload.email,
        passwordHash=hash_password(payload.password),
        role="ORG_ADMIN",
    )
    db.add(user)
    db.flush()

    provision_starter_data(db, org.id)
    db.commit()

    token, expires_at = create_session(db, user.id)
    db.commit()
    resp = ok({"user": _session_user(user, org)})
    set_session_cookie(resp, token, expires_at)
    return resp


@router.post("/login", status_code=200)
def login(payload: LoginInput, response: Response, db: OrmSession = Depends(get_db)) -> Any:
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.passwordHash):
        return err("INVALID_CREDENTIALS", "Incorrect email or password", 401)

    org = db.get(Organization, user.orgId)
    assert org is not None
    token, expires_at = create_session(db, user.id)
    db.commit()
    resp = ok({"user": _session_user(user, org)})
    set_session_cookie(resp, token, expires_at)
    return resp


@router.post("/logout")
def logout(request: Request, response: Response, db: OrmSession = Depends(get_db)) -> Any:
    destroy_session(request, db)
    db.commit()
    clear_session_cookie(response)
    return Response(status_code=204)


@router.get("/me")
def me(request: Request, db: OrmSession = Depends(get_db)) -> Any:
    """Never 401s — anonymous callers receive { user: null }."""
    try:
        user = require_user(request, db)
    except Exception:  # noqa: BLE001 — mirrors the TS catch-all → {user: null}
        return ok({"user": None})
    user_row = db.get(User, user.id)
    org = db.get(Organization, user.orgId)
    assert user_row is not None and org is not None
    return ok({"user": _session_user(user_row, org)})
