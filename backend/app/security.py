"""Authentication & sessions — verbatim port of `src/lib/auth.ts`.

Critical compatibility detail (verified empirically against the live DB):
Node's `crypto.scryptSync(password, salt, 32)` is called with the salt as a
*hex string*, which Node encodes as raw UTF-8 bytes — NOT hex-decoded bytes.
Python must therefore use `salt.encode()` (the ASCII bytes of the hex text),
i.e. `hashlib.scrypt(pw.encode(), salt=salt_str.encode(), n=16384, r=8, p=1,
dklen=32)`. Verified: reproduces `f8a00d…8964e6` for ops@meridian.in.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass

from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from .config import SESSION_TTL_MS
from .database import get_db, now_ms
from .domain import SESSION_COOKIE, WRITE_ROLES, Role
from .errors import ApiError
from .ids import new_id
from .models import Organization, Session as SessionRow, User

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P, _DKLEN = 16384, 8, 1, 32


def hash_password(password: str) -> str:
    """Format: <16-byte-hex-salt>:<32-byte-hex-hash> (Node scrypt-compatible)."""
    salt = os.urandom(16).hex()
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_DKLEN)
    return f"{salt}:{digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    parts = stored.split(":")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return False
    salt, expected = parts
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_DKLEN)
    return hmac.compare_digest(digest.hex(), expected)


@dataclass(frozen=True)
class SessionUser:
    id: str
    name: str
    email: str
    role: Role
    orgId: str
    orgName: str
    orgDemo: bool

    def as_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "orgId": self.orgId,
            "orgName": self.orgName,
            "orgDemo": self.orgDemo,
        }


def create_session(db: OrmSession, user_id: str) -> tuple[str, int]:
    """Create a DB-backed session row; returns (token, expiresAt-ms)."""
    token = os.urandom(32).hex()
    expires_at = now_ms() + SESSION_TTL_MS
    db.add(SessionRow(id=new_id(), userId=user_id, token=token, expiresAt=expires_at))
    db.flush()
    return token, expires_at


def set_session_cookie(response: Response, token: str, expires_at_ms: int) -> None:
    """httpOnly, SameSite=lax, path=/ — identical flags to the Next.js API."""
    from datetime import datetime, timezone

    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        expires=datetime.fromtimestamp(expires_at_ms / 1000, tz=timezone.utc),
        path="/",
        httponly=True,
        samesite="lax",
        secure=False,
    )


def clear_session_cookie(response: Response) -> None:
    response.set_cookie(key=SESSION_COOKIE, value="", expires=0, path="/", httponly=True, samesite="lax", secure=False)


def _token_from_cookie(request: Request) -> str | None:
    return request.cookies.get(SESSION_COOKIE)


def require_user(request: Request, db: OrmSession = Depends(get_db)) -> SessionUser:
    """Resolve the authenticated principal; raises NO_SESSION (401) otherwise."""
    token = _token_from_cookie(request)
    if not token:
        raise ApiError("NO_SESSION", "Not signed in", 401)

    row = db.execute(select(SessionRow).where(SessionRow.token == token)).scalar_one_or_none()
    if row is None or row.expiresAt < now_ms():
        raise ApiError("NO_SESSION", "Session expired", 401)

    user = db.get(User, row.userId)
    if user is None:
        raise ApiError("NO_SESSION", "Session expired", 401)
    org = db.get(Organization, user.orgId)
    if org is None:
        raise ApiError("NO_SESSION", "Session expired", 401)

    return SessionUser(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,  # type: ignore[arg-type]
        orgId=user.orgId,
        orgName=org.name,
        orgDemo=bool(org.demo),
    )


def destroy_session(request: Request, db: OrmSession) -> None:
    token = _token_from_cookie(request)
    if token:
        for row in db.execute(select(SessionRow).where(SessionRow.token == token)).scalars().all():
            db.delete(row)


def require_write(user: SessionUser) -> None:
    """Throws FORBIDDEN when the caller's role cannot mutate ops data."""
    if user.role not in WRITE_ROLES:
        raise ApiError("FORBIDDEN", "Your role is read-only", 403)


def require_admin(user: SessionUser) -> None:
    """Throws FORBIDDEN unless the caller can change configuration."""
    if user.role not in ("ORG_ADMIN", "OPS_MANAGER"):
        raise ApiError("FORBIDDEN", "Only Org Admin / Ops Manager can change operational thresholds", 403)
