"""Analytics route — time-series + corridor/driver/status breakdowns.

Port of src/app/api/analytics/route.ts. Day keys are UTC `YYYY-MM-DD` strings
exactly like `Date.toISOString().slice(0, 10)`.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from ..database import get_db, now_ms
from ..domain import SHIPMENT_STATUSES
from ..engines.rates import BASELINE_FUEL_EFF_KMPL
from ..errors import js_round, ok
from ..models import Driver, Shipment, ShipmentEvent, Vehicle
from ..security import require_user
from ..thresholds import get_org_thresholds

from ..jsonpar import NormalizedJSONResponse

router = APIRouter(default_response_class=NormalizedJSONResponse, prefix="/api/analytics", tags=["analytics"])

DAY_MS = 24 * 3600 * 1000
#: demo rate — average km a truck covers in a day (for utilization estimate)
KM_PER_VEHICLE_DAY = 500


def _day_key(ms: int) -> str:
    """ISO UTC day — mirrors `new Date(ms).toISOString().slice(0, 10)`."""
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d")


def _parse_days(raw: str | None) -> float:
    """JS: `Math.min(90, Math.max(7, Number(searchParams.get("days") ?? 30) || 30))`.

    Absent / empty / non-numeric / zero → 30; anything else clamped to [7, 90].
    """
    if raw is None:
        n = 30.0
    else:
        try:
            n = float(raw)
        except ValueError:
            n = 30.0
        if n != n or n == 0:  # NaN guard + JS falsy ||
            n = 30.0
    return min(90.0, max(7.0, n))


@router.get("")
def analytics(
    db: OrmSession = Depends(get_db),
    user: Any = Depends(require_user),
    days: str | None = None,
) -> Any:
    days_n = int(_parse_days(days))

    cfg = get_org_thresholds(db, user.orgId)
    t = cfg["values"]

    now = now_ms()
    window_start = now - days_n * DAY_MS
    window_start_day = _day_key(window_start)

    day_keys: list[str] = []
    for i in range(days_n - 1, -1, -1):
        day_keys.append(_day_key(now - i * DAY_MS))

    delivered_events = (
        db.query(ShipmentEvent, Shipment)
        .join(Shipment, ShipmentEvent.shipmentId == Shipment.id)
        .filter(
            Shipment.orgId == user.orgId,
            ShipmentEvent.type == "Delivered",
            ShipmentEvent.at >= window_start,
        )
        .order_by(ShipmentEvent.at.asc())
        .all()
    )
    all_shipments = db.query(Shipment.status).filter(Shipment.orgId == user.orgId).all()
    vehicles = db.query(Vehicle.id, Vehicle.fuelEffKmpl).filter(Vehicle.orgId == user.orgId).all()
    drivers = (
        db.query(Driver)
        .filter(Driver.orgId == user.orgId)
        .order_by(Driver.trips.desc(), Driver.rating.desc())
        .limit(6)
        .all()
    )

    eff_by_vehicle = {v.id: v.fuelEffKmpl for v in vehicles}
    fleet_size = max(len(vehicles), 1)
    buffer_ms = t["sla"]["on_time_buffer_min"] * 60 * 1000
    co2_per_litre = t["carbon_targets"]["diesel_kg_co2_per_litre"]

    class DayAgg:
        __slots__ = ("shipments", "on_time", "cost_sum", "cost_n", "co2", "vehicle_days")

        def __init__(self) -> None:
            self.shipments = 0
            self.on_time = 0
            self.cost_sum = 0.0
            self.cost_n = 0
            self.co2 = 0.0
            self.vehicle_days = 0.0

    days_map: dict[str, DayAgg] = {k: DayAgg() for k in day_keys}
    corridors: dict[str, dict[str, float]] = {}

    for ev, s in delivered_events:
        key = _day_key(ev.at)
        agg = days_map.get(key)
        if agg is None:
            continue
        agg.shipments += 1
        if ev.at <= s.etaAt + buffer_ms:
            agg.on_time += 1
        if s.distanceKm > 0:
            agg.cost_sum += s.costInr / s.distanceKm
            agg.cost_n += 1
        eff = eff_by_vehicle.get(s.assignedVehicleId, BASELINE_FUEL_EFF_KMPL) if s.assignedVehicleId else BASELINE_FUEL_EFF_KMPL
        agg.co2 += (s.distanceKm / max(eff, 0.1)) * co2_per_litre
        agg.vehicle_days += s.distanceKm / KM_PER_VEHICLE_DAY

        ck = f"{s.originCity} → {s.destCity}"
        c = corridors.setdefault(ck, {"shipments": 0, "onTime": 0, "costSum": 0.0})
        c["shipments"] += 1
        if ev.at <= s.etaAt + buffer_ms:
            c["onTime"] += 1
        c["costSum"] += s.costInr

    # Delivered shipments whose event predates the window still count once for
    # corridor stats — pull a wider set for corridor ranking.
    corridor_events = (
        db.query(ShipmentEvent, Shipment)
        .join(Shipment, ShipmentEvent.shipmentId == Shipment.id)
        .filter(
            Shipment.orgId == user.orgId,
            ShipmentEvent.type == "Delivered",
            ShipmentEvent.at >= now - 90 * DAY_MS,
        )
        .all()
    )
    for ev, s in corridor_events:
        ck = f"{s.originCity} → {s.destCity}"
        c = corridors.setdefault(ck, {"shipments": 0, "onTime": 0, "costSum": 0.0})
        if c["shipments"] == 0:
            c["shipments"] += 1
            if ev.at <= s.etaAt + buffer_ms:
                c["onTime"] += 1
            c["costSum"] += s.costInr

    on_time_series = [
        {
            "date": k,
            "onTimePct": js_round((a.on_time / a.shipments) * 100) if a.shipments > 0 else 0,
            "shipments": a.shipments,
        }
        for k, a in days_map.items()
    ]
    cost_series = [
        {"date": k, "costPerKm": js_round((a.cost_sum / a.cost_n) * 10) / 10 if a.cost_n > 0 else 0}
        for k, a in days_map.items()
    ]
    co2_series = [{"date": k, "co2Kg": js_round(a.co2 * 10) / 10} for k, a in days_map.items()]
    utilization_series = [
        {
            "date": k,
            "utilizationPct": min(100, js_round((a.vehicle_days / fleet_size) * 100)),
        }
        for k, a in days_map.items()
    ]

    top_corridors = sorted(
        (
            {
                "corridor": corridor,
                "shipments": int(c["shipments"]),
                "onTimePct": js_round((c["onTime"] / c["shipments"]) * 100) if c["shipments"] > 0 else 0,
                "avgCostInr": js_round(c["costSum"] / c["shipments"]) if c["shipments"] > 0 else 0,
            }
            for corridor, c in corridors.items()
        ),
        key=lambda x: x["shipments"],
        reverse=True,
    )[:5]

    driver_leaderboard = [
        {"name": d.name, "trips": d.trips, "onTimePct": d.onTimePct, "rating": d.rating} for d in drivers
    ]

    status_counts: dict[str, int] = {}
    for (status,) in all_shipments:
        status_counts[status] = status_counts.get(status, 0) + 1
    status_breakdown = [{"status": status, "count": status_counts.get(status, 0)} for status in SHIPMENT_STATUSES]

    return ok(
        {
            "onTimeSeries": on_time_series,
            "costSeries": cost_series,
            "co2Series": co2_series,
            "utilizationSeries": utilization_series,
            "topCorridors": top_corridors,
            "driverLeaderboard": driver_leaderboard,
            "statusBreakdown": status_breakdown,
            "meta": {
                "dataStatus": "demo",
                "configVersion": f"{cfg['version']}:{cfg['configHash']}",
                "windowDays": int(days_n),
                "windowStartDay": window_start_day,
            },
        }
    )


__all__ = ["router"]
