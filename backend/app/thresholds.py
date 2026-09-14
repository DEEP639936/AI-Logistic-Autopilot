"""Threshold configuration — port of `src/lib/config/thresholds.ts` plus the
`getOrgThresholds` / `audit` helpers from `src/lib/api-helpers.ts`.

The YAML template (identical values to the Next.js copy) is the single source
of truth for metadata (unit/min/max/default/description). Per-org overrides
are persisted in ThresholdConfig with a version + configHash. Business logic
never hardcodes these values.

configHash parity note: JS `JSON.stringify` emits compact JSON
(`{"a":1,"b":2}`), so the Python side serializes with the same separators
before hashing — hashes computed for identical configs match across both
backends.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from .config import THRESHOLDS_YAML
from .errors import ApiError, ConfigValidationError
from .ids import new_id
from .models import Notification, ThresholdConfig

# ---------------------------------------------------------------------------
# YAML template
# ---------------------------------------------------------------------------

_TEMPLATE_CACHE: dict[str, Any] | None = None


def _load_yaml() -> dict[str, Any]:
    global _TEMPLATE_CACHE
    if _TEMPLATE_CACHE is None:
        raw = Path(THRESHOLDS_YAML).read_text(encoding="utf-8")
        doc = yaml.safe_load(raw)
        if not isinstance(doc, dict):
            raise RuntimeError(f"Thresholds YAML at {THRESHOLDS_YAML} did not parse to a mapping")
        _TEMPLATE_CACHE = doc
    return _TEMPLATE_CACHE


def template_thresholds() -> dict[str, dict[str, dict[str, Any]]]:
    """Raw template with full Param metadata (for the admin schema view)."""
    return _load_yaml()  # type: ignore[return-value]


def default_thresholds() -> dict[str, dict[str, float]]:
    """Mutable numeric values extracted from the template (JS defaultThresholds)."""
    doc = _load_yaml()
    out: dict[str, dict[str, float]] = {}
    for section, params in doc.items():
        if section == "config_version":
            continue
        out[section] = {}
        for key, param in params.items():
            out[section][key] = param["value"]
    return out


def config_hash(cfg: Any) -> str:
    """sha256 of the compact-JSON serialization, sliced to 12 chars (JS parity)."""
    payload = json.dumps(cfg, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Validation (range checks against YAML Param metadata + weight-sum checks)
# ---------------------------------------------------------------------------


def validate_thresholds(cfg: dict[str, Any]) -> None:
    """Validate a mutable numeric config; raises ConfigValidationError (422)."""
    template = template_thresholds()
    details: list[dict[str, str]] = []

    for section, params in template.items():
        if section == "config_version":
            continue
        values = cfg.get(section)
        if not isinstance(values, dict):
            details.append({"key": section, "violation": "missing section"})
            continue
        for key, meta in params.items():
            v = values.get(key)
            if not isinstance(v, (int, float)) or isinstance(v, bool) or v != v:  # NaN guard
                details.append({"key": f"{section}.{key}", "violation": "must be a number"})
                continue
            if v < meta["min"] or v > meta["max"]:
                details.append(
                    {
                        "key": f"{section}.{key}",
                        "violation": f"out of range [{_fmt(meta['min'])}, {_fmt(meta['max'])}]",
                    }
                )

    for weights_key in ("route_scoring_weights", "assignment_weights"):
        weights = cfg.get(weights_key)
        if isinstance(weights, dict) and weights:
            total = sum(v for v in weights.values() if isinstance(v, (int, float)))
            if abs(total - 1) > 0.001:
                details.append({"key": weights_key, "violation": f"weights must sum to 1.0 (got {total:.3f})"})

    if details:
        raise ConfigValidationError(details)


def _fmt(v: float) -> str:
    return str(int(v)) if float(v).is_integer() else str(v)


# ---------------------------------------------------------------------------
# Per-org config (lazy create) — port of getOrgThresholds
# ---------------------------------------------------------------------------


def get_org_thresholds(db: OrmSession, org_id: str) -> dict[str, Any]:
    """Get (or lazily create) the org's threshold config row."""
    row = db.execute(select(ThresholdConfig).where(ThresholdConfig.orgId == org_id)).scalar_one_or_none()
    if row is None:
        defaults = default_thresholds()
        row = ThresholdConfig(
            id=new_id(),
            orgId=org_id,
            json=json.dumps(defaults, separators=(",", ":")),
            version=1,
            configHash=config_hash(defaults),
        )
        db.add(row)
        db.flush()
    return {
        "values": json.loads(row.json),
        "version": row.version,
        "configHash": row.configHash,
        "updatedBy": row.updatedBy,
        "updatedAt": row.updatedAt,
    }


# ---------------------------------------------------------------------------
# Audit trail (emitted as org notifications, exactly like api-helpers.ts)
# ---------------------------------------------------------------------------


def audit(db: OrmSession, org_id: str, actor_id: str, action: str, detail: str) -> None:
    del actor_id  # kept for signature parity with the TS helper
    db.add(Notification(id=new_id(), orgId=org_id, title=f"Audit · {action}", body=detail, kind="audit"))


__all__ = [
    "ApiError",
    "audit",
    "config_hash",
    "default_thresholds",
    "get_org_thresholds",
    "template_thresholds",
    "validate_thresholds",
]
