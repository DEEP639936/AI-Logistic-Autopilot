"""Threshold configuration routes — schema view, admin update, reset.

Port of src/app/api/thresholds/route.ts and
src/app/api/thresholds/reset/route.ts. The YAML template drives the schema;
per-org values live in ThresholdConfig (versioned + hashed).
"""
from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db, iso_utc
from ..errors import err, ok
from ..ids import new_id
from ..models import ThresholdConfig
from ..schemas import ThresholdsPutInput, validate_model
from ..security import require_user
from ..thresholds import (
    audit,
    config_hash,
    default_thresholds,
    get_org_thresholds,
    template_thresholds,
    validate_thresholds,
)

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/thresholds", tags=["thresholds"])

SECTION_LABELS: dict[str, str] = {
    "delay_risk": "Delay Risk Bands",
    "sla": "SLA & Escalation",
    "route_scoring_weights": "Route Scoring Weights",
    "assignment_weights": "Assignment Weights",
    "return_load": "Return-Load Matching",
    "capacity_consolidation": "Load Consolidation",
    "fuel_anomaly": "Fuel Anomaly",
    "predictive_maintenance": "Predictive Maintenance",
    "disruption": "Disruption Playbooks",
    "ai_recommendations": "AI Recommendations",
    "carbon_targets": "Carbon Targets",
    "notifications": "Notification Delivery",
    "demo": "Demo Simulator",
    "feature_flags": "Feature Flags",
}


def _number_step(key: str, unit: str) -> float:
    if unit == "weight":
        return 0.01
    if key.startswith("auto_approve") or key.startswith("min_confidence"):
        return 0.01
    if unit == "ratio":
        return 0.01
    return 1


def _field_label(key: str) -> str:
    """`key.replace(/_/g, " ").replace(/\\b\\w/g, c => c.toUpperCase())`."""
    return re.sub(r"\b\w", lambda m: m.group(0).upper(), key.replace("_", " "))


def _normalize_config(values: dict[str, Any]) -> dict[str, dict[str, float]]:
    """Booleans → 1/0 (feature flags round-trip) — port of normalizeConfig."""
    out: dict[str, dict[str, float]] = {}
    for section, params in values.items():
        out[section] = {}
        for key, val in params.items():
            out[section][key] = (1 if val else 0) if isinstance(val, bool) else val
    return out


@router.get("")
def get_thresholds(db: OrmSession = Depends(get_db), user: Any = Depends(require_user)) -> Any:
    cfg = get_org_thresholds(db, user.orgId)
    template = template_thresholds()
    values = _normalize_config(cfg["values"])

    schema: list[dict[str, Any]] = []
    for section_key, fields in template.items():
        if section_key == "config_version":
            continue
        schema.append(
            {
                "key": section_key,
                "label": SECTION_LABELS.get(section_key, section_key),
                "fields": [
                    {
                        "key": field_key,
                        "label": _field_label(field_key),
                        "description": meta["description"],
                        "unit": meta["unit"],
                        "min": meta["min"],
                        "max": meta["max"],
                        "step": _number_step(field_key, meta["unit"]),
                        "value": values.get(section_key, {}).get(field_key, meta["value"]),
                        "defaultValue": meta["default"],
                    }
                    for field_key, meta in fields.items()
                ],
            }
        )

    return ok(
        {
            "config": values,
            "meta": {
                "version": cfg["version"],
                "configHash": cfg["configHash"],
                "updatedAt": iso_utc(cfg.get("updatedAt")),
                "updatedBy": cfg.get("updatedBy"),
                "schemaVersion": "1.0.0",
            },
            "schema": schema,
        }
    )


@router.put("")
def put_thresholds(
    payload: Any = Body(default=None),
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    if user.role not in ("ORG_ADMIN", "OPS_MANAGER"):
        return err("FORBIDDEN", "Only Org Admin / Ops Manager can change operational thresholds", 403)

    config = payload.get("config") if isinstance(payload, dict) else None
    if not isinstance(config, dict):
        return err("VALIDATION", "Body must be { config: {...} }", 400)
    parsed = validate_model(ThresholdsPutInput, {"config": config}, "Body must be { config: {...} }")
    validate_thresholds(parsed["config"])

    current = get_org_thresholds(db, user.orgId)
    version = current["version"] + 1
    hash12 = config_hash(parsed["config"])
    payload_json = json.dumps(parsed["config"], separators=(",", ":"))

    row = db.execute(select(ThresholdConfig).where(ThresholdConfig.orgId == user.orgId)).scalar_one_or_none()
    if row is None:
        db.add(
            ThresholdConfig(
                id=new_id(),
                orgId=user.orgId,
                json=payload_json,
                version=version,
                configHash=hash12,
                updatedBy=user.email,
            )
        )
    else:
        row.json = payload_json
        row.version = version
        row.configHash = hash12
        row.updatedBy = user.email
    db.commit()

    audit(db, user.orgId, user.id, "thresholds.update", f"{user.name} updated thresholds to v{version} ({hash12})")
    db.commit()

    return ok({"version": version, "configHash": hash12})


@router.post("/reset")
def reset_thresholds(db: OrmSession = Depends(get_db), user: Any = Depends(require_user)) -> Any:
    if user.role not in ("ORG_ADMIN", "OPS_MANAGER"):
        return ok({"version": 0, "configHash": ""})  # read-only roles: no-op (TS parity)

    defaults = default_thresholds()
    current = db.execute(select(ThresholdConfig).where(ThresholdConfig.orgId == user.orgId)).scalar_one_or_none()
    version = (current.version if current is not None else 0) + 1
    hash12 = config_hash(defaults)
    payload_json = json.dumps(defaults, separators=(",", ":"))

    if current is None:
        db.add(
            ThresholdConfig(
                id=new_id(),
                orgId=user.orgId,
                json=payload_json,
                version=version,
                configHash=hash12,
                updatedBy=user.email,
            )
        )
    else:
        current.json = payload_json
        current.version = version
        current.configHash = hash12
        current.updatedBy = user.email
    db.commit()

    audit(db, user.orgId, user.id, "thresholds.reset", f"{user.name} reset thresholds to template defaults (v{version})")
    db.commit()

    return ok({"version": version, "configHash": hash12})


__all__ = ["router"]
