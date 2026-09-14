"""Delay-risk engine — pure function, no DB access.

Port of `src/lib/ai/delay-risk.ts`. Produces a 0-100 risk score, a banded
classification and human-readable factor contributions. Every business
constant comes from the org's thresholds config (mutable via the admin screen).
"""
from __future__ import annotations

from typing import Any

from .common import clamp, js_round, round1
from .rates import DEFAULT_CONGESTION, DEFAULT_WEATHER_RISK


def risk_band_for(score: float, thresholds: dict[str, Any]) -> str:
    d = thresholds["delay_risk"]
    if score >= d["critical_min"]:
        return "critical"
    if score >= d["high_min"]:
        return "high"
    if score >= d["medium_min"]:
        return "medium"
    return "low"


def band_from_threshold_values(score: float, t: dict[str, float]) -> str:
    """Band helper for callers that only hold plain numeric config values."""
    if score >= t["critical_min"]:
        return "critical"
    if score >= t["high_min"]:
        return "high"
    if score >= t["medium_min"]:
        return "medium"
    return "low"


def score_shipment_delay(
    *,
    slack_min: float,
    corridor: dict[str, float] | None,
    priority: str,
    vehicle_health: int | None,
    thresholds: dict[str, Any],
) -> dict[str, Any]:
    """Compute {score, band, factors[]} exactly like scoreShipmentDelay."""
    t = thresholds
    alert_min = t["delay_risk"]["slack_alert_min"]
    factors: list[dict[str, Any]] = []

    # 1. Schedule slack — the dominant term.
    if slack_min <= 0:
        slack_contribution = 55.0
        slack_detail = f"ETA already passed by {abs(js_round(slack_min))} min — recovery window closed"
    elif slack_min < alert_min:
        slack_contribution = 22 + ((alert_min - slack_min) / max(alert_min, 1)) * 30
        slack_detail = f"ETA slack {js_round(slack_min)} min vs {alert_min} min alert line"
    else:
        excess = min(1.0, (slack_min - alert_min) / 720)
        slack_contribution = 18 - excess * 14
        slack_detail = f"Comfortable slack of {js_round(slack_min)} min before ETA"
    factors.append({"factor": "Schedule slack", "contribution": round1(slack_contribution), "detail": slack_detail})

    # 2. Corridor congestion & weather.
    congestion = corridor["congestion"] if corridor else DEFAULT_CONGESTION
    weather_risk = corridor["weatherRisk"] if corridor else DEFAULT_WEATHER_RISK
    cong_contribution = congestion * 30
    factors.append(
        {
            "factor": "Corridor congestion",
            "contribution": round1(cong_contribution),
            "detail": f"Corridor congestion {congestion * 100:.0f}% slows average speed",
        }
    )
    weather_contribution = weather_risk * 25
    factors.append(
        {
            "factor": "Weather risk",
            "contribution": round1(weather_contribution),
            "detail": f"Seasonal weather risk {weather_risk * 100:.0f}% on this corridor",
        }
    )

    # 3. Priority boost.
    priority_contribution = 0.0
    if priority == "critical":
        priority_contribution = 15
        factors.append(
            {"factor": "Priority surge", "contribution": 15, "detail": "Critical priority consignment — zero tolerance for slips"}
        )
    elif priority == "priority":
        priority_contribution = 8
        factors.append({"factor": "Priority surge", "contribution": 8, "detail": "Priority consignment carries a +8 risk premium"})

    # 4. Vehicle health (when the load is on a fleet vehicle).
    health_contribution = 0.0
    if vehicle_health is not None and vehicle_health < 85:
        health_contribution = clamp(((100 - vehicle_health) / 100) * 22, 0, 15)
        factors.append(
            {
                "factor": "Vehicle health",
                "contribution": round1(health_contribution),
                "detail": f"Vehicle health {vehicle_health}/100 raises breakdown risk",
            }
        )

    raw = slack_contribution + cong_contribution + weather_contribution + priority_contribution + health_contribution
    score = js_round(clamp(raw, 2, 97))
    band = risk_band_for(score, t)
    return {"score": score, "band": band, "factors": factors[:4]}
