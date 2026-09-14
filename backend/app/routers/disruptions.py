"""Disruption routes — list incidents + playbook actions.

Port of src/app/api/disruptions/route.ts and
src/app/api/disruptions/[id]/action/route.ts.

The corridor separator regex on the action path matches the arrow (→),
en/em dashes and the ASCII hyphen so seeded `Mumbai–Pune` corridors affect
real shipments; the GET list intentionally splits on `→` only (TS parity).
"""
from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db, iso_utc, now_ms
from ..dto import parse_json_array
from ..engines.delay_risk import band_from_threshold_values
from ..engines.validation import require_write
from ..errors import err, js_round, ok
from ..ids import new_id
from ..models import Disruption, Notification, Shipment, ShipmentEvent
from ..schemas import DisruptionActionInput, validate_model
from ..security import require_user
from ..thresholds import audit, get_org_thresholds

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/disruptions", tags=["disruptions"])

SEVERITY_ORDER = ["low", "medium", "high", "critical"]
_SLIP_EVENT_TYPE = "Disruption"


@router.get("")
def list_disruptions(db: OrmSession = Depends(get_db), user: Any = Depends(require_user)) -> Any:
    cfg = get_org_thresholds(db, user.orgId)

    rows = db.query(Disruption).filter(Disruption.orgId == user.orgId).order_by(Disruption.createdAt.desc()).all()

    active = (
        db.query(Shipment.originCity, Shipment.destCity)
        .filter(
            Shipment.orgId == user.orgId,
            Shipment.status.in_(["scheduled", "assigned", "in_transit"]),
        )
        .all()
    )

    incidents: list[dict[str, Any]] = []
    for d in rows:
        # TS: `d.corridor.split("→").map(x => x.trim())` — no dash handling here.
        parts = [x.strip() for x in d.corridor.split("→")]
        a = parts[0] if parts else ""
        b = parts[1] if len(parts) > 1 else None
        affected = sum(
            1
            for (origin_city, dest_city) in active
            if (origin_city == a and dest_city == b)
            or (origin_city == b and dest_city == a)
            or (not b and (origin_city == a or dest_city == a))
        )
        incidents.append(
            {
                "id": d.id,
                "type": d.type,
                "severity": d.severity,
                "title": d.title,
                "corridor": d.corridor,
                "note": d.note,
                "status": d.status,
                "affectedCount": affected if affected > 0 else d.affectedCount,
                "steps": parse_json_array(d.steps),
                "stepIndex": d.stepIndex,
                "log": parse_json_array(d.log),
                "createdAt": iso_utc(d.createdAt),
                "resolvedAt": iso_utc(d.resolvedAt),
            }
        )

    return ok(
        {
            "incidents": incidents,
            "meta": {"dataStatus": "demo", "configVersion": f"{cfg['version']}:{cfg['configHash']}"},
        }
    )


@router.post("/{disruption_id}/action")
def disruption_action(
    disruption_id: str,
    payload: DisruptionActionInput,
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
) -> Any:
    # The TS route validates the raw body itself to keep the envelope shape.
    validate_model(DisruptionActionInput, {"action": payload.action}, "Invalid action payload")
    require_write(user)

    disruption = db.query(Disruption).filter(Disruption.id == disruption_id, Disruption.orgId == user.orgId).first()
    if disruption is None:
        return err("NOT_FOUND", "Disruption not found in your organization", 404)

    cfg = get_org_thresholds(db, user.orgId)
    t = cfg["values"]

    corridor_parts = re.split(r"→|–|—|-", disruption.corridor)
    corridor_a = corridor_parts[0].strip() if corridor_parts else None
    corridor_b = corridor_parts[1].strip() if len(corridor_parts) > 1 else None

    affected_shipments = (
        db.query(Shipment)
        .filter(
            Shipment.orgId == user.orgId,
            Shipment.status.in_(["scheduled", "assigned", "in_transit"]),
            or_(
                and_(Shipment.originCity == corridor_a, Shipment.destCity == corridor_b),
                and_(Shipment.originCity == corridor_b, Shipment.destCity == corridor_a),
                *([] if corridor_b else [Shipment.originCity == corridor_a, Shipment.destCity == corridor_a]),
            ),
        )
        .all()
    )

    action = payload.action
    now = now_ms()
    log = parse_json_array(disruption.log)
    steps = parse_json_array(disruption.steps)
    step_index = disruption.stepIndex
    severity = disruption.severity
    status = disruption.status
    resolved_at = disruption.resolvedAt
    affected_refs: list[str] = []

    if action == "run_playbook":
        if disruption.status == "resolved":
            return err("INVALID_TRANSITION", "This incident is already resolved", 409)
        if step_index >= len(steps):
            return err("INVALID_TRANSITION", "Playbook already fully executed", 409)
        step_index += 1
        step = steps[step_index - 1]
        log.append({"at": iso_utc(now), "entry": f"Playbook {step_index}/{len(steps)}: {step}"})
        if step_index >= len(steps):
            status = "monitoring"

        # Real effect: active loads on the corridor absorb a 30-min slip and a risk bump.
        for s in affected_shipments:
            affected_refs.append(s.ref)
            new_score = min(97, s.riskScore + 8)
            s.etaAt = s.etaAt + 30 * 60_000
            s.riskScore = new_score
            s.riskBand = band_from_threshold_values(new_score, t["delay_risk"])
            db.add(
                ShipmentEvent(
                    id=new_id(),
                    shipmentId=s.id,
                    type=_SLIP_EVENT_TYPE,
                    note=f'{disruption.title} — playbook step "{step}" · ETA +30 min',
                    city=s.destCity if s.status == "in_transit" else s.originCity,
                    at=now,
                )
            )
    elif action == "escalate":
        if disruption.status == "resolved":
            return err("INVALID_TRANSITION", "Resolved incidents cannot be escalated", 409)
        try:
            idx = SEVERITY_ORDER.index(disruption.severity)
        except ValueError:
            idx = 0
        if severity == "critical" or idx >= len(SEVERITY_ORDER) - 1:
            return err("INVALID_TRANSITION", "Incident is already critical", 409)
        severity = SEVERITY_ORDER[idx + 1]
        status = "open"
        log.append({"at": iso_utc(now), "entry": f"Escalated to {severity} by {user.name}"})
        affected_refs.extend(s.ref for s in affected_shipments)
    else:  # resolve
        if disruption.status == "resolved":
            return err("INVALID_TRANSITION", "This incident is already resolved", 409)
        status = "resolved"
        resolved_at = now
        log.append({"at": iso_utc(now), "entry": f"Resolved by {user.name} — corridor reopened"})
        affected_refs.extend(s.ref for s in affected_shipments)

    disruption.stepIndex = step_index
    disruption.severity = severity
    disruption.status = status
    disruption.resolvedAt = resolved_at
    disruption.log = json.dumps(log, separators=(",", ":"))
    disruption.affectedCount = max(disruption.affectedCount, len(affected_refs))

    title_word = "playbook executed" if action == "run_playbook" else ("escalated" if action == "escalate" else "resolved")
    db.add(
        Notification(
            id=new_id(),
            orgId=user.orgId,
            title=f"Disruption {title_word}",
            body=f"{disruption.title} · {status.upper()}"
            + (f" · {len(affected_refs)} shipments affected" if affected_refs else ""),
            kind="disruption",
        )
    )
    db.commit()

    audit(db, user.orgId, user.id, f"disruption.{action}", f'{user.name} ran {action} on "{disruption.title}"')
    db.commit()

    updated = db.get(Disruption, disruption.id)
    assert updated is not None
    incident = {
        "id": updated.id,
        "type": updated.type,
        "severity": updated.severity,
        "title": updated.title,
        "corridor": updated.corridor,
        "note": updated.note,
        "status": updated.status,
        "affectedCount": updated.affectedCount,
        "steps": parse_json_array(updated.steps),
        "stepIndex": updated.stepIndex,
        "log": parse_json_array(updated.log),
        "createdAt": iso_utc(updated.createdAt),
        "resolvedAt": iso_utc(updated.resolvedAt),
    }

    return ok({"incident": incident, "affected": affected_refs})


__all__ = ["router"]
