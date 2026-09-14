"""Role guards — port of the guard half of `src/lib/ai/validation.ts`.

(Request schemas live in `app/schemas.py` as pydantic models; this module
keeps the role-guard API so routers read like their Next.js counterparts.)
"""
from __future__ import annotations

from ..security import SessionUser, require_admin, require_write  # re-exported

__all__ = ["SessionUser", "require_admin", "require_write"]
