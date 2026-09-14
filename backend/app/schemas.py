"""Pydantic request models — port of the zod schemas in `src/lib/ai/validation.ts`.

Validation failures are converted into the shared error envelope with code
VALIDATION and a `details` array of `{path, message}` — the same shape the
zod-based Next.js API returns — via `validate_model`.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, BeforeValidator, Field, field_validator

from .errors import ApiError
from .hubs import HUBS

# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _to_str(v: Any) -> Any:
    return v.strip() if isinstance(v, str) else v


def _to_lower_str(v: Any) -> Any:
    return v.strip().lower() if isinstance(v, str) else v


def _coerce_number(v: Any) -> Any:
    """z.coerce.number() equivalent: strings → numbers."""
    if isinstance(v, str):
        s = v.strip()
        try:
            return int(s) if re.fullmatch(r"-?\d+", s) else float(s)
        except ValueError:
            return v  # let pydantic produce the type error
    return v


def _parse_iso_date(v: Any) -> Any:
    """Validate a parseable ISO date; returns the epoch-ms value."""
    if not isinstance(v, str) or len(v) < 4:
        raise ValueError("Expected an ISO date")
    try:
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Expected a parseable ISO date") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _validate_hub(value: str) -> str:
    if not any(h.city.lower() == value.lower() for h in HUBS):
        raise ValueError("Unknown hub city (must be one of the network hubs)")
    return value


EmailStr = Annotated[str, BeforeValidator(_to_lower_str), Field(min_length=5, max_length=120)]
TrimStr = Annotated[str, BeforeValidator(_to_str)]
NumberCoerced = Annotated[float, BeforeValidator(_coerce_number)]
IntCoerced = Annotated[int, BeforeValidator(_coerce_number)]


def _email_check(v: str) -> str:
    if not _EMAIL_RE.match(v):
        raise ValueError("Enter a valid email address")
    return v


def validate_model(model: type[BaseModel], data: Any, message: str) -> dict[str, Any]:
    """Validate with a pydantic model; raises the envelope VALIDATION error."""
    try:
        validated = model.model_validate(data)
    except Exception as exc:  # noqa: BLE001 — converted into the shared envelope
        issues: list[dict[str, str]] = []
        if hasattr(exc, "errors"):  # pydantic ValidationError
            for e in exc.errors():  # type: ignore[attr-defined]
                path = ".".join(str(p) for p in e.get("loc", ()))
                issues.append({"path": path or "body", "message": str(e.get("msg", "invalid value"))})
        else:
            issues.append({"path": "body", "message": str(exc)})
        raise ApiError("VALIDATION", message, 400, issues) from exc
    return validated.model_dump(exclude_unset=False)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _email_check(v)


class RegisterInput(BaseModel):
    name: TrimStr = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    orgName: TrimStr = Field(min_length=2, max_length=80)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _email_check(v)

    @field_validator("name", "orgName")
    @classmethod
    def _min_two(cls, v: str, info) -> str:  # noqa: ANN001
        if len(v) < 2:
            label = "Name" if info.field_name == "name" else "Organization name"
            raise ValueError(f"{label} must be at least 2 characters")
        return v


# ---------------------------------------------------------------------------
# Shipments
# ---------------------------------------------------------------------------


class CreateShipmentInput(BaseModel):
    client: TrimStr = Field(min_length=2, max_length=80)
    cargo: TrimStr = Field(min_length=2, max_length=80)
    weightKg: IntCoerced = Field(ge=100, le=40000)
    volumeM3: NumberCoerced = Field(gt=0, le=80)
    originCity: TrimStr
    destCity: TrimStr
    plannedDeparture: Annotated[int, BeforeValidator(_parse_iso_date)]
    priority: Literal["standard", "priority", "critical"]

    @field_validator("weightKg")
    @classmethod
    def _weight_bounds(cls, v: int) -> int:
        if v < 100:
            raise ValueError("Weight must be at least 100 kg")
        if v > 40000:
            raise ValueError("Weight cannot exceed 40,000 kg")
        return v

    @field_validator("volumeM3")
    @classmethod
    def _volume_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Volume must be greater than 0")
        return v

    @field_validator("originCity", "destCity")
    @classmethod
    def _hub(cls, v: str, info) -> str:  # noqa: ANN001
        if len(v) < 2:
            raise ValueError(f"{info.field_name} is required")
        return _validate_hub(v)

    @field_validator("destCity")
    @classmethod
    def _differs(cls, v: str, info) -> str:  # noqa: ANN001
        origin = (info.data or {}).get("originCity")
        if origin and origin.lower() == v.lower():
            raise ValueError("Origin and destination must differ")
        return v


class AssignInput(BaseModel):
    vehicleId: str = Field(min_length=1)


class ShipmentListQuery(BaseModel):
    status: Literal["draft", "scheduled", "assigned", "in_transit", "delivered", "cancelled", "exception"] | None = None
    q: TrimStr | None = Field(default=None, max_length=60)
    page: IntCoerced = Field(default=1, ge=1)
    pageSize: IntCoerced = Field(default=10, ge=1, le=100)


# ---------------------------------------------------------------------------
# Route optimization
# ---------------------------------------------------------------------------


class OptimizeInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    shipmentId: str | None = None
    originCity: TrimStr | None = None
    destCity: TrimStr | None = None
    weightKg: IntCoerced | None = Field(default=None, ge=100, le=40000)
    cargoType: TrimStr | None = Field(default=None, min_length=2, max_length=80)

    @field_validator("originCity", "destCity")
    @classmethod
    def _hub(cls, v: str | None) -> str | None:
        return _validate_hub(v) if v is not None else v


# ---------------------------------------------------------------------------
# Consolidation / return loads / disruptions
# ---------------------------------------------------------------------------


class ConsolidationApplyInput(BaseModel):
    shipmentIds: list[str] = Field(min_length=2, max_length=8)


class AcceptReturnInput(BaseModel):
    matchId: str = Field(min_length=3)


class DisruptionActionInput(BaseModel):
    action: Literal["run_playbook", "resolve", "escalate"]


# ---------------------------------------------------------------------------
# Thresholds / notifications / misc
# ---------------------------------------------------------------------------


class ThresholdsPutInput(BaseModel):
    config: dict[str, dict[str, float]]


class NotificationsReadInput(BaseModel):
    ids: list[str] | None = Field(default=None, max_length=200)
    all: bool | None = None


class DemoRequestInput(BaseModel):
    name: TrimStr = Field(min_length=2, max_length=80)
    email: EmailStr
    org: TrimStr = Field(min_length=2, max_length=80)
    fleetSize: TrimStr = Field(min_length=1, max_length=20)
    message: TrimStr = Field(default="", max_length=600)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _email_check(v)


class CopilotHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class CopilotInput(BaseModel):
    message: TrimStr = Field(min_length=1, max_length=1000)
    history: list[CopilotHistoryItem] = Field(default_factory=list, max_length=20)
