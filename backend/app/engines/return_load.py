"""Return-load engine — pure, deterministic.

Port of `src/lib/ai/return-load.ts`. Matches available fleet vehicles to
scheduled loads that can be picked up near the vehicle's current city so the
truck never deadheads home empty. Match filters (min score, max detour,
min profit) come from the org's return_load config.
"""
from __future__ import annotations

from typing import Any

from ..hubs import distance_km
from .common import clamp, format_en_in, js_round
from .rates import (
    RETURN_COST_INR_PER_KM,
    RETURN_DETOUR_INR_PER_KM,
    RETURN_PAY_INR_PER_KM,
    RETURN_SEARCH_RADIUS_KM,
)


def find_return_loads(
    vehicles: list[dict[str, Any]],
    shipments: list[dict[str, Any]],
    thresholds: dict[str, Any],
) -> list[dict[str, Any]]:
    t = thresholds["return_load"]
    max_detour = min(js_round(t["max_detour_km"]), RETURN_SEARCH_RADIUS_KM)
    candidates: list[dict[str, Any]] = []

    for vehicle in vehicles:
        if vehicle["status"] != "available":
            continue

        for shipment in shipments:
            if shipment["status"] != "scheduled":
                continue

            # Pickup must sit within the detour radius of the vehicle's city.
            detour_km = distance_km(vehicle["lat"], vehicle["lng"], shipment["originLat"], shipment["originLng"])
            if detour_km > max_detour:
                continue

            # The vehicle must be able to legally carry the load.
            if shipment["weightKg"] > vehicle["capacityKg"]:
                continue

            pay_inr = js_round(shipment["distanceKm"] * RETURN_PAY_INR_PER_KM)
            cost_inr = js_round(shipment["distanceKm"] * RETURN_COST_INR_PER_KM + detour_km * RETURN_DETOUR_INR_PER_KM)
            profit_inr = pay_inr - cost_inr

            # Weighted score: proximity 40 · capacity 25 · pay/profit 35.
            prox_norm = js_round(clamp((1 - detour_km / max(max_detour, 1)) * 100, 0, 100))
            fill = shipment["weightKg"] / vehicle["capacityKg"]
            cap_norm = js_round(clamp(100 - abs(fill - 0.75) * 100, 10, 100))
            profit_norm = js_round(clamp((profit_inr / max(pay_inr, 1)) / 0.5 * 100, 0, 100))

            score = js_round(prox_norm * 0.4 + cap_norm * 0.25 + profit_norm * 0.35)
            if score < t["min_match_score"] or profit_inr < t["min_profit_inr"]:
                continue

            candidates.append(
                {
                    "id": f"{vehicle['id']}:{shipment['id']}",
                    "vehicle": {
                        "id": vehicle["id"],
                        "regNo": vehicle["regNo"],
                        "typeLabel": vehicle["typeLabel"],
                        "currentCity": vehicle["currentCity"],
                        "lat": vehicle["lat"],
                        "lng": vehicle["lng"],
                    },
                    "load": {
                        "ref": shipment["ref"],
                        "client": shipment["client"],
                        "cargo": shipment["cargo"],
                        "weightKg": shipment["weightKg"],
                        "destCity": shipment["destCity"],
                        "payInr": pay_inr,
                    },
                    "detourKm": detour_km,
                    "score": score,
                    "profitInr": profit_inr,
                    "scoreBreakdown": [
                        {
                            "factor": "Proximity",
                            "contribution": js_round(prox_norm * 0.4 * 10) / 10,
                            "detail": f"{detour_km} km detour from {vehicle['currentCity']} to pickup in {shipment['originCity']}",
                        },
                        {
                            "factor": "Capacity fit",
                            "contribution": js_round(cap_norm * 0.25 * 10) / 10,
                            "detail": (
                                f"{shipment['weightKg'] / 1000:.1f}t on a "
                                f"{vehicle['capacityKg'] / 1000:.1f}t {vehicle['typeLabel']}"
                            ),
                        },
                        {
                            "factor": "Pay & profit",
                            "contribution": js_round(profit_norm * 0.35 * 10) / 10,
                            "detail": (
                                f"{'−' if profit_inr < 0 else ''}₹{format_en_in(abs(profit_inr))} net after detour cost"
                            ),
                        },
                    ],
                }
            )

    return sorted(candidates, key=lambda c: c["score"], reverse=True)[:8]


def parse_match_id(match_id: str) -> dict[str, str] | None:
    """Validate the encoded match id `<vehicleId>:<shipmentId>`."""
    parts = match_id.split(":")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return None
    return {"vehicleId": parts[0], "shipmentId": parts[1]}
