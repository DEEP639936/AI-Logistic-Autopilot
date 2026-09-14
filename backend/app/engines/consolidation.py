"""Consolidation engine — pure, deterministic.

Port of `src/lib/ai/consolidation.ts`. Groups scheduled/draft shipments
heading to the same destination whose planned departures sit inside the org's
max_wait_hrs window, sizes them against the smallest suitable fleet vehicle
and prices the merged trip.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from ..domain import VEHICLE_TYPES
from .common import js_round
from .rates import CONSOL_HANDLING_RATE

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _fmt(ms: int) -> tuple[str, str]:
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return f"{dt.day} {_MONTHS[dt.month - 1]}", f"{dt.hour:02d}:{dt.minute:02d}"


def departure_window(a_ms: int, b_ms: int) -> str:
    day_a, time_a = _fmt(a_ms)
    day_b, time_b = _fmt(b_ms)
    if day_a == day_b:
        return f"{day_a}, {time_a} → {time_b} UTC"
    return f"{day_a} {time_a} → {day_b} {time_b} UTC"


def _suitable_vehicle(total_weight_kg: float, total_volume_m3: float) -> tuple[int, float]:
    """Smallest fleet vehicle type whose deck can hold the combined load."""
    candidates = sorted(VEHICLE_TYPES, key=lambda v: v.capacityKg)
    for v in candidates:
        if v.capacityKg >= total_weight_kg and v.capacityM3 >= total_volume_m3:
            return v.capacityKg, v.capacityM3
    return candidates[-1].capacityKg, candidates[-1].capacityM3


def consolidated_cost(costs: list[float]) -> float:
    """Most expensive leg at full price, every piggybacked load at a handling share."""
    if not costs:
        return 0
    total = max(costs)
    rest = sum(costs) - total
    return total + rest * CONSOL_HANDLING_RATE


def savings_for_group(costs: list[float]) -> dict[str, int]:
    total = sum(costs)
    consolidated = consolidated_cost(costs) * 1.15  # 15% hub & planning overhead
    savings_inr = max(0, js_round(total - consolidated))
    savings_pct = js_round((savings_inr / total) * 100) if total > 0 else 0
    return {"savingsInr": savings_inr, "savingsPct": savings_pct}


def build_consolidation_groups(
    shipments: list[dict[str, Any]],
    thresholds: dict[str, Any],
) -> list[dict[str, Any]]:
    max_wait_ms = thresholds["capacity_consolidation"]["max_wait_hrs"] * 3600 * 1000
    max_size = js_round(thresholds["capacity_consolidation"]["max_group_size"])

    eligible = [s for s in shipments if s["status"] in ("scheduled", "draft")]

    # Bucket by destination city (same destination ⇒ one merged linehaul).
    buckets: dict[str, list[dict[str, Any]]] = {}
    for s in eligible:
        buckets.setdefault(s["destCity"], []).append(s)

    groups: list[dict[str, Any]] = []

    for dest_city, bucket in buckets.items():
        if len(bucket) < 2:
            continue
        ordered = sorted(bucket, key=lambda s: s["plannedDeparture"])

        # Greedy window: anchor at the earliest departure, absorb within max_wait_hrs.
        anchor = 0
        while anchor < len(ordered) - 1:
            window_end = ordered[anchor]["plannedDeparture"] + max_wait_ms
            members: list[dict[str, Any]] = []
            for i in range(anchor, len(ordered)):
                if len(members) >= max_size:
                    break
                if ordered[i]["plannedDeparture"] <= window_end:
                    members.append(ordered[i])
                else:
                    break
            anchor += max(1, len(members))

            if len(members) < 2:
                continue

            total_weight_kg = sum(s["weightKg"] for s in members)
            total_vol = sum(s["volumeM3"] for s in members)
            cap_kg, cap_m3 = _suitable_vehicle(total_weight_kg, total_vol)
            fill_weight_pct = min(100, js_round((total_weight_kg / cap_kg) * 100))
            fill_vol_pct = min(100, js_round((total_vol / cap_m3) * 100))

            savings = savings_for_group([s["costInr"] for s in members])
            if savings["savingsInr"] <= 0:
                continue

            origin = members[0]["originCity"]
            same_origin = all(s["originCity"] == origin for s in members)
            corridor_label = f"{origin} → {dest_city}" if same_origin else f"{origin} +{len(members) - 1} → {dest_city}"
            dep_times = [s["plannedDeparture"] for s in members]

            groups.append(
                {
                    "id": f"cg-{re.sub(r'[^a-z0-9]+', '', dest_city.lower())}-{''.join(m['ref'][-4:] for m in members)}",
                    "corridor": corridor_label,
                    "shipments": [
                        {
                            "id": s["id"],
                            "ref": s["ref"],
                            "client": s["client"],
                            "weightKg": s["weightKg"],
                            "volumeM3": s["volumeM3"],
                            "destCity": s["destCity"],
                        }
                        for s in members
                    ],
                    "totalWeightKg": total_weight_kg,
                    "fillWeightPct": fill_weight_pct,
                    "fillVolPct": fill_vol_pct,
                    "savingsInr": savings["savingsInr"],
                    "savingsPct": savings["savingsPct"],
                    "departureWindow": departure_window(min(dep_times), max(dep_times)),
                }
            )

    return sorted(groups, key=lambda g: g["savingsInr"], reverse=True)[:6]
