"""API response envelope, error types and FastAPI exception handlers.

Port of the `ok` / `err` / `handleError` helpers in `src/lib/api-helpers.ts`.
Every error response has exactly this shape (the frontend ApiError reads it):

    {"error": {"code", "message", "details", "requestId"}}
"""
from __future__ import annotations

import logging
import math
import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .hubs import UnknownHubError
from .jsonpar import NormalizedJSONResponse

log = logging.getLogger("api")


class ApiError(Exception):
    """Raised anywhere in request handling; converted into the error envelope."""

    def __init__(self, code: str, message: str, status: int = 400, details: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details


class ConfigValidationError(ApiError):
    """Threshold config violated the YAML template metadata (CONFIG_INVALID)."""

    def __init__(self, details: list[dict[str, str]]) -> None:
        summary = "; ".join(f"{d['key']} ({d['violation']})" for d in details)
        super().__init__("CONFIG_INVALID", f"Threshold config invalid: {summary}", 422, details)
        self.details = details


def _request_id() -> str:
    return uuid.uuid4().hex


def ok(data: Any, status: int = 200) -> NormalizedJSONResponse:
    return NormalizedJSONResponse(content=data, status_code=status)


def err(code: str, message: str, status: int = 400, details: Any = None) -> NormalizedJSONResponse:
    body = {"error": {"code": code, "message": message, "details": details, "requestId": _request_id()}}
    return NormalizedJSONResponse(content=body, status_code=status)


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details, "requestId": _request_id()}}


def handle_error(e: Exception) -> JSONResponse:
    """Mirror of `handleError` in api-helpers.ts."""
    if isinstance(e, ApiError):
        return err(e.code, e.message, e.status, e.details)
    if isinstance(e, UnknownHubError):
        return err("INVALID_HUB", str(e), 422)
    log.exception("[api] unhandled error")
    return err("INTERNAL", "Something went wrong on our side.", 500)


def install_exception_handlers(app: FastAPI) -> None:
    """Convert framework-level errors into the same {error:{...}} envelope."""

    @app.exception_handler(ApiError)
    async def _api_error_handler(_req: Request, exc: ApiError) -> JSONResponse:
        return handle_error(exc)

    @app.exception_handler(UnknownHubError)
    async def _hub_error_handler(_req: Request, exc: UnknownHubError) -> JSONResponse:
        return handle_error(exc)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(_req: Request, exc: RequestValidationError) -> JSONResponse:
        issues: list[dict[str, str]] = []
        for raw in exc.errors():
            loc = ".".join(str(p) for p in raw.get("loc", ()) if p not in ("body", "query", "path"))
            issues.append({"path": loc or "body", "message": str(raw.get("msg", "invalid value"))})
        json_invalid = any(str(raw.get("type", "")).startswith("json_invalid") for raw in exc.errors())
        if json_invalid:
            return err("BAD_JSON", "Request body must be valid JSON", 400, issues)
        return err("VALIDATION", "Invalid request payload", 400, issues)

    @app.exception_handler(StarletteHTTPException)
    async def _http_handler(_req: Request, exc: StarletteHTTPException) -> JSONResponse:
        return err("NOT_FOUND" if exc.status_code == 404 else "ERROR", str(exc.detail), exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled_handler(_req: Request, exc: Exception) -> JSONResponse:
        return handle_error(exc)


# ---------------------------------------------------------------------------
# JS-compatible numeric helpers used by the engines/DTO layer
# ---------------------------------------------------------------------------


def js_round(v: float) -> int:
    """JS Math.round: half rounds toward +Infinity (Python's round() does not)."""
    return int(math.floor(v + 0.5))


def clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def round1(v: float) -> float:
    return js_round(v * 10) / 10
