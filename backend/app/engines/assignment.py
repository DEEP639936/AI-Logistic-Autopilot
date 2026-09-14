"""Vehicle-assignment engine — pure, deterministic ranking of fleet vehicles.

Port of `src/lib/ai/assignment.ts`. Weights come from the org's
assignment_weights config.
"""
from __future__ import annotations

from typing import Any

from ..hubs import distance_km
from .common import clamp, js_round, round1


def rank_vehicles(
    shipment: dict[str, Any],
    vehicles: list[dict[str, Any]],
    thresholds: dict[str, Any],
    ctx: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """Rank assignable vehicles; returns top 5 with {vehicle, score, breakdown}."""
    w = thresholds["assignment_weights"]
    fleet_util = clamp((ctx or {}).get("fleetUtilizationPct", 50.0), 0, 100)
    results: list[dict[str, Any]] = []

    for vehicle in vehicles:
        # Hard gate: the vehicle must physically carry the load.
        if vehicle["capacityKg"] < shipment["weightKg"] or vehicle["capacityM3"] < shipment["volumeM3"]:
            continue

        breakdown: list[dict[str, Any]] = []

        # capacity_fit — prefer 60-95% fill by weight or volume.
        fill_w = shipment["weightKg"] / vehicle["capacityKg"]
        fill_v = shipment["volumeM3"] / vehicle["capacityM3"]
        fill = max(fill_w, fill_v)
        if 0.6 <= fill <= 0.95:
            cap_value = 100
            cap_detail = f"{fill * 100:.0f}% utilised — ideal window (60-95%)"
        elif fill < 0.6:
            cap_value = js_round(40 + (fill / 0.6) * 60)
            cap_detail = (
                f"Only {fill * 100:.0f}% utilised — {vehicle['capacityKg'] / 1000:.1f}t deck"
                f" for {shipment['weightKg'] / 1000:.1f}t load"
            )
        else:
            cap_value = js_round(clamp(100 - (fill - 0.95) * 400, 35, 99))
            cap_detail = f"Tight {fill * 100:.0f}% fill — near deck limit"
        breakdown.append({"factor": "Capacity fit", "value": cap_value, "detail": cap_detail})

        # proximity — deadhead distance from vehicle to pickup.
        km = distance_km(vehicle["lat"], vehicle["lng"], shipment["originLat"], shipment["originLng"])
        prox_value = 100 if km <= 0 else (10 if km >= 400 else js_round(100 - (km / 400) * 90))
        breakdown.append({"factor": "Proximity", "value": prox_value, "detail": f"{km} km deadhead to {shipment['originCity']}"})

        # availability — current fleet state.
        avail_value = {"available": 100, "in_use": 20}.get(vehicle["status"], 0)
        avail_detail = {
            "available": "Available now",
            "in_use": "Currently on a load",
        }.get(vehicle["status"], "In maintenance bay")
        breakdown.append({"factor": "Availability", "value": avail_value, "detail": avail_detail})

        # driver_hours — deterministic demo profile (no driver linkage yet).
        driver_value = 45 if vehicle["status"] == "in_use" else 85
        breakdown.append(
            {
                "factor": "Driver hours",
                "value": driver_value,
                "detail": "Duty hours partially consumed on current run"
                if vehicle["status"] == "in_use"
                else "Fresh duty window (demo profile)",
            }
        )

        # cost — right-sizing: oversized vehicle penalised for small loads.
        ratio = vehicle["capacityKg"] / max(shipment["weightKg"], 1)
        cost_value = 95 if ratio <= 1.5 else js_round(clamp(95 - (ratio - 1.5) * 45, 25, 95))
        cost_detail = (
            f"Right-sized {vehicle['typeLabel']} for this load"
            if ratio <= 1.5
            else (
                f"Oversized: {vehicle['typeLabel']} burns ~{round1(ratio)}x deck"
                f" for {shipment['weightKg'] / 1000:.1f}t"
            )
        )
        breakdown.append({"factor": "Cost fit", "value": cost_value, "detail": cost_detail})

        # utilization — balance the fleet: idle vehicles preferred when fleet is busy.
        if vehicle["status"] == "available":
            util_value = js_round(clamp(55 + (100 - fleet_util) * 0.5, 55, 95))
            util_detail = f"Fleet at {fleet_util:.0f}% utilisation — idle unit absorbs load"
        else:
            util_value = 30
            util_detail = f"Fleet at {fleet_util:.0f}% utilisation — loaded unit adds imbalance"
        breakdown.append({"factor": "Utilization balance", "value": util_value, "detail": util_detail})

        score = (
            cap_value * w["capacity_fit"]
            + prox_value * w["proximity"]
            + avail_value * w["availability"]
            + driver_value * w["driver_hours"]
            + cost_value * w["cost"]
            + util_value * w["utilization"]
        )

        results.append({"vehicle": vehicle, "score": round1(score), "breakdown": breakdown})

    return sorted(results, key=lambda r: r["score"], reverse=True)[:5]
