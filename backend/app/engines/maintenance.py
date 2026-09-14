"""Predictive-maintenance engine — pure, deterministic.

Port of `src/lib/ai/maintenance.ts`. Flags service-due vehicles (odometer vs
service interval), low health scores and fuel anomalies, parameterised by the
org's predictive_maintenance and fuel_anomaly config sections.
"""
from __future__ import annotations

from typing import Any

from .common import format_en_in, js_round
from .rates import BASELINE_FUEL_EFF_KMPL

_SEV_RANK = {"critical": 0, "warning": 1}


def maintenance_flags(vehicles: list[dict[str, Any]], thresholds: dict[str, Any]) -> list[dict[str, Any]]:
    pm = thresholds["predictive_maintenance"]
    deviation = thresholds["fuel_anomaly"]["deviation_pct"]
    flags: list[dict[str, Any]] = []

    for v in vehicles:
        km_since_service = v["odometerKm"] - v["lastServiceOdometerKm"]
        due_at = pm["service_interval_km"] - pm["warn_before_km"]

        if km_since_service >= pm["service_interval_km"]:
            flags.append(
                {
                    "vehicleId": v["id"],
                    "regNo": v["regNo"],
                    "issue": "Service overdue",
                    "severity": "critical",
                    "detail": (
                        f"{format_en_in(km_since_service)} km since last service — "
                        f"{format_en_in(km_since_service - pm['service_interval_km'])} km past the "
                        f"{format_en_in(pm['service_interval_km'])} km interval"
                    ),
                }
            )
        elif km_since_service >= due_at:
            flags.append(
                {
                    "vehicleId": v["id"],
                    "regNo": v["regNo"],
                    "issue": "Service due soon",
                    "severity": "warning",
                    "detail": (
                        f"{format_en_in(km_since_service)} km since last service — within "
                        f"{format_en_in(pm['warn_before_km'])} km of the "
                        f"{format_en_in(pm['service_interval_km'])} km interval"
                    ),
                }
            )

        if v["healthScore"] < pm["health_warn_below"]:
            critical_health = v["healthScore"] < pm["health_warn_below"] - 15
            flags.append(
                {
                    "vehicleId": v["id"],
                    "regNo": v["regNo"],
                    "issue": "Low health score",
                    "severity": "critical" if critical_health else "warning",
                    "detail": (
                        f"Health {v['healthScore']}/100 vs {pm['health_warn_below']} warn line"
                        " — inspect driveline and brakes"
                    ),
                }
            )

        anomaly_floor = BASELINE_FUEL_EFF_KMPL * (1 - deviation / 100)
        if v["fuelEffKmpl"] > 0 and v["fuelEffKmpl"] < anomaly_floor:
            pct = js_round(((BASELINE_FUEL_EFF_KMPL - v["fuelEffKmpl"]) / BASELINE_FUEL_EFF_KMPL) * 100)
            flags.append(
                {
                    "vehicleId": v["id"],
                    "regNo": v["regNo"],
                    "issue": "Fuel anomaly",
                    "severity": "warning",
                    "detail": (
                        f"{v['fuelEffKmpl']:.2f} km/L vs {BASELINE_FUEL_EFF_KMPL} baseline — "
                        f"{pct}% above the {deviation}% deviation limit "
                        "(possible siphoning or engine fault)"
                    ),
                }
            )

    return sorted(flags, key=lambda f: _SEV_RANK[f["severity"]])
