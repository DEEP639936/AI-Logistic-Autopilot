"""Idempotent demo seed — faithful port of src/scripts/seed.ts.

mulberry32(42) produces the exact same stream as the TypeScript version
(verified against node), so with the identical call order this seeds the same
realistic Indian logistics dataset: 2 orgs, 6 users, 32+3 vehicles, 25+2
drivers, 166+8 shipments (incl. guaranteed consolidation clusters and
disrupted-corridor weighting), ~800 events, 6 disruptions with playbooks,
6 recommendations, 5 notifications and thresholds v1.

Run against a THROWAWAY database copy:
    DATABASE_PATH=/tmp/seed-test.db python3 -m app.seed
NEVER run it against the shared production DB (it wipes the orgs it seeds).
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Callable, TypeVar

from sqlalchemy import select

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal  # noqa: E402
from app.domain import VEHICLE_TYPES  # noqa: E402
from app.engines.common import js_round  # noqa: E402
from app.hubs import CORRIDORS, HUBS, distance_km, hub  # noqa: E402
from app.ids import new_id  # noqa: E402
from app.models import (  # noqa: E402
    Disruption,
    Driver,
    Notification,
    Organization,
    Recommendation,
    Shipment,
    ShipmentEvent,
    Session as SessionRow,
    ThresholdConfig,
    User,
    Vehicle,
)
from app.security import hash_password  # noqa: E402
from app.thresholds import config_hash, default_thresholds  # noqa: E402

T = TypeVar("T")

MIN = 60_000
HOUR = 60 * MIN
DAY = 24 * HOUR


def _to_int32(x: int) -> int:
    x &= 0xFFFFFFFF
    return x - 0x100000000 if x >= 0x80000000 else x


def _imul(x: int, y: int) -> int:
    return _to_int32((x & 0xFFFFFFFF) * (y & 0xFFFFFFFF))


class Mulberry32:
    """Deterministic RNG — bit-exact port of the mulberry32 in seed.ts."""

    def __init__(self, seed: int) -> None:
        self.a = _to_int32(seed)

    def __call__(self) -> float:
        a = _to_int32(self.a + 0x6D2B79F5)
        self.a = a
        t = _imul(a ^ ((a & 0xFFFFFFFF) >> 15), 1 | a)
        t = _to_int32(t + _imul(t ^ ((t & 0xFFFFFFFF) >> 7), 61 | t)) ^ t
        return ((t ^ ((t & 0xFFFFFFFF) >> 14)) & 0xFFFFFFFF) / 4294967296


rand = Mulberry32(42)
NOW = int(datetime.now(timezone.utc).timestamp() * 1000)

CLIENTS = [
    "Nandini Dairy", "BigBasket Grocers", "Asian Paints Depots", "Haldiram Foods", "Parle Agro",
    "V-Guard Electronics", "Sunfeast Snacks", "D-Mart Supply", "Cello World", "Patanjali Distribution",
    "Tata Steel Vendors", "Flipkart Suppliers", "Amul Fresh", "DS Group", "Aqua Sub Pumps", "Kaya Ceramics",
]
CARGO = [
    "FMCG pallets", "Auto components", "Packaged foods", "Consumer electronics", "Ceramic tiles",
    "Beverages", "Textile rolls", "Agri produce", "Chemicals (non-haz)", "Steel coils", "E-commerce parcels", "Reefer dairy",
]
FIRST = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rudra", "Omkar", "Manav", "Karan", "Rohan", "Vikram", "Suresh", "Ramesh", "Pavan", "Deepak", "Manoj", "Anil", "Sunil", "Ganesh", "Mahesh", "Ravi", "Prakash", "Naveen", "Santosh", "Umesh", "Bala"]
LAST = ["Sharma", "Patel", "Reddy", "Nair", "Singh", "Kumar", "Das", "Gowda", "Naik", "Pillai", "Yadav", "Verma", "Joshi", "Kulkarni", "Desai", "Mehta", "Iyer", "Rao", "Khan", "Chauhan"]
STATE_CODES = ["MH", "KA", "DL", "TN", "WB", "GJ", "TS", "HR", "UP", "KL", "MP", "PB"]


def pick(arr: list[T] | tuple[T, ...]) -> T:
    return arr[int(rand() * len(arr))]


def rand_int(lo: int, hi: int) -> int:
    return lo + int(rand() * (hi - lo + 1))


def reg_no(i: int) -> str:
    code = STATE_CODES[i % len(STATE_CODES)]
    seq = str(10 + (i % 80))
    letters = chr(65 + (i % 26)) + chr(65 + ((i * 7) % 26))
    return f"{code} {seq} {letters} {1000 + ((i * 137) % 9000)}"


def pickup(weight_kg: int) -> str:
    return f"{weight_kg / 1000:.1f}t"


def mid_city(from_city: str, to_city: str) -> str:
    f, t = hub(from_city), hub(to_city)
    best, best_d = HUBS[0], float("inf")
    for h in HUBS:
        if h.city in (from_city, to_city):
            continue
        dd = abs(h.lat - (f.lat + t.lat) / 2) + abs(h.lng - (f.lng + t.lng) / 2)
        if dd < best_d:
            best_d, best = dd, h
    return best.city


def seed_org(
    db: Any,
    *,
    name: str,
    slug: str,
    vehicle_count: int,
    driver_count: int,
    shipment_count: int,
    users: list[dict[str, str]],
    distribution: dict[str, int] | None = None,
) -> Organization:
    del shipment_count  # parity with the TS signature (drives nothing directly)

    # wipe (idempotent) — explicit child-first deletion (SQLite FK safety)
    existing = db.execute(select(Organization).where(Organization.slug == slug)).scalar_one_or_none()
    if existing is not None:
        org_id0 = existing.id
        shipment_ids = [row[0] for row in db.query(Shipment.id).filter(Shipment.orgId == org_id0).all()]
        if shipment_ids:
            db.query(ShipmentEvent).filter(ShipmentEvent.shipmentId.in_(shipment_ids)).delete(synchronize_session=False)
        db.query(Shipment).filter(Shipment.orgId == org_id0).delete(synchronize_session=False)
        db.query(Vehicle).filter(Vehicle.orgId == org_id0).delete(synchronize_session=False)
        db.query(Driver).filter(Driver.orgId == org_id0).delete(synchronize_session=False)
        db.query(Recommendation).filter(Recommendation.orgId == org_id0).delete(synchronize_session=False)
        db.query(Disruption).filter(Disruption.orgId == org_id0).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.orgId == org_id0).delete(synchronize_session=False)
        db.query(ThresholdConfig).filter(ThresholdConfig.orgId == org_id0).delete(synchronize_session=False)
        user_ids = [row[0] for row in db.query(User.id).filter(User.orgId == org_id0).all()]
        if user_ids:
            db.query(SessionRow).filter(SessionRow.userId.in_(user_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.orgId == org_id0).delete(synchronize_session=False)
        db.query(Organization).filter(Organization.id == org_id0).delete(synchronize_session=False)
        db.commit()

    org = Organization(id=new_id(), name=name, slug=slug, plan="growth", demo=1)
    db.add(org)
    db.flush()
    org_id = org.id
    password_hash = hash_password("Demo@12345")
    for u in users:
        db.add(User(id=new_id(), orgId=org_id, name=u["name"], email=u["email"], role=u["role"], passwordHash=password_hash))
    db.flush()

    # vehicles
    vehicle_rows: list[Vehicle] = []
    for i in range(vehicle_count):
        vtype = pick(VEHICLE_TYPES)
        h = pick(HUBS)
        odo = rand_int(40_000, 480_000)
        # ~82% healthy fleet; the rest trend low so predictive maintenance has signal.
        health_score = rand_int(72, 97) if rand() < 0.82 else rand_int(52, 69)
        since_service = rand_int(3_000, 15_000) if rand() < 0.8 else rand_int(18_600, 21_800)
        fuel = js_round((2.55 + rand() * 0.35) * 10) / 10 if rand() < 0.12 else js_round((3.15 + rand() * 1.05) * 10) / 10
        vehicle_rows.append(
            Vehicle(
                id=new_id(),
                orgId=org_id,
                regNo=reg_no(i),
                type=vtype.id,
                capacityKg=vtype.capacityKg,
                capacityM3=vtype.capacityM3,
                status="available",
                healthScore=health_score,
                odometerKm=odo,
                lastServiceOdometerKm=odo - since_service,
                fuelEffKmpl=fuel,
                currentCity=h.city,
                lat=h.lat,
                lng=h.lng,
            )
        )
    db.add_all(vehicle_rows)
    db.flush()
    vehicles = sorted(vehicle_rows, key=lambda v: v.regNo)

    # drivers
    driver_rows: list[Driver] = []
    for i in range(driver_count):
        name = f"{FIRST[i % len(FIRST)]} {pick(LAST)}"
        phone = f"+91 {80000 + i * 137} {str(10000 + rand_int(0, 89999))[:5]}"
        license_no = f"{STATE_CODES[i % len(STATE_CODES)]}{rand_int(10, 99)}2019000{1000 + i}"
        driver_rows.append(
            Driver(
                id=new_id(),
                orgId=org_id,
                name=name,
                phone=phone,
                licenseNo=license_no,
                status="available",
                hoursToday=rand_int(2, 10),
                rating=js_round((3.9 + rand() * 1.1) * 10) / 10,
                trips=rand_int(120, 1400),
                onTimePct=rand_int(78, 98),
            )
        )
    db.add_all(driver_rows)
    db.flush()
    drivers = sorted(driver_rows, key=lambda d: d.name)

    # shipments
    dist = distribution or {"delivered": 116, "in_transit": 12, "assigned": 8, "scheduled": 18, "exception": 3, "cancelled": 3}
    # Guaranteed consolidation clusters: same corridor, same-day departure.
    clusters = [
        {"from": "Mumbai", "to": "Pune", "atHour": 6, "n": 3},
        {"from": "Bengaluru", "to": "Chennai", "atHour": 9, "n": 3},
    ]
    corridor_pairs: list[dict[str, Any]] = []
    for c in CORRIDORS:
        corridor_pairs.append({"from": c.from_city, "to": c.to_city, "def": c})
        corridor_pairs.append({"from": c.to_city, "to": c.from_city, "def": c})
    # Weight disrupted demo corridors 4x so playbook runs affect real shipments.
    disrupted_cities = ["Mumbai|Pune", "Delhi|Ludhiana", "Kolkata|Chennai", "Kolkata|Guwahati", "Nagpur|Hyderabad", "Bengaluru|Chennai"]
    weighted_pairs = list(corridor_pairs)
    for pair in corridor_pairs:
        key = "|".join(sorted([pair["from"], pair["to"]]))
        if key in disrupted_cities:
            weighted_pairs.extend([pair, pair, pair])

    ref_counter = 1001
    active_vehicles: set[str] = set()

    for status, count in dist.items():
        for _ in range(count):
            pair = pick(weighted_pairs if vehicle_count >= 20 else corridor_pairs)
            o, d = hub(pair["from"]), hub(pair["to"])
            km = distance_km(o.lat, o.lng, d.lat, d.lng)
            vtype = pick(VEHICLE_TYPES)
            weight_kg = rand_int(round(vtype.capacityKg * 0.35), round(vtype.capacityKg * 0.92))
            volume_m3 = js_round(vtype.capacityM3 * (0.4 + rand() * 0.5) * 10) / 10
            priority = "critical" if rand() < 0.12 else ("priority" if rand() < 0.3 else "standard")

            needs_vehicle = status in ("in_transit", "assigned", "delivered", "exception")
            vehicle: Vehicle | None = None
            driver: Driver | None = None
            if needs_vehicle:
                if status in ("in_transit", "assigned"):
                    free = [v for v in vehicles if v.id not in active_vehicles]
                    vehicle = pick(free) if free else pick(vehicles)
                    if status == "in_transit":
                        active_vehicles.add(vehicle.id)
                else:
                    vehicle = pick(vehicles)
                driver = pick(drivers)

            progress = 0
            if status == "delivered":
                depart_ms = NOW - rand_int(1, 29) * DAY - rand_int(0, 20) * HOUR
                progress = 100
            elif status == "in_transit":
                depart_ms = NOW - rand_int(2, 30) * HOUR
                progress = rand_int(20, 80)
            elif status == "assigned":
                depart_ms = NOW + rand_int(1, 26) * HOUR
                progress = rand_int(0, 10)
            elif status == "exception":
                depart_ms = NOW - rand_int(6, 40) * HOUR
                progress = rand_int(30, 70)
            elif status == "cancelled":
                depart_ms = NOW + rand_int(1, 5) * DAY
            else:
                depart_ms = NOW + rand_int(2, 7) * DAY

            # ETA: linehaul 55 km/h + handling; delivered history ~82% on-time.
            transit_min = (km / 55) * 60 + 90
            if status == "delivered" and rand() < 0.18:
                late_factor = 1.15 + rand() * 0.3
            else:
                late_factor = min(1, 0.92 + rand() * 0.12)
            eta_at_ms = depart_ms + transit_min * late_factor * MIN
            slack_min = js_round((eta_at_ms - min(NOW, depart_ms + transit_min * MIN)) / MIN)

            congestion, weather_risk = pair["def"].congestion, pair["def"].weather_risk
            risk_score = min(
                96,
                js_round(
                    congestion * 18
                    + weather_risk * 16
                    + (12 if priority == "critical" else 6 if priority == "priority" else 1)
                    + (28 if slack_min < 45 else 12 if slack_min < 180 else 2)
                    + (12 if (vehicle is not None and vehicle.healthScore < 70) else 2)
                    + rand() * 6
                ),
            )
            risk_band = "critical" if risk_score >= 75 else "high" if risk_score >= 55 else "medium" if risk_score >= 30 else "low"
            risk_factors = [
                {"factor": "Schedule slack", "contribution": 34 if slack_min < 45 else 14, "detail": f"ETA slack {slack_min} min"},
                {
                    "factor": "Corridor congestion",
                    "contribution": js_round(congestion * 22),
                    "detail": f"{pair['from']}–{pair['to']} congestion {congestion * 100:.0f}%",
                },
                {
                    "factor": "Weather exposure",
                    "contribution": js_round(weather_risk * 18),
                    "detail": "Monsoon/fog exposure on corridor" if weather_risk > 0.5 else "Clear conditions expected",
                },
            ]

            cost_inr = js_round(km * (90 + rand() * 50))
            ref = f"APA-26-{ref_counter}"
            ref_counter += 1

            shipment = Shipment(
                id=new_id(),
                orgId=org_id,
                ref=ref,
                client=pick(CLIENTS),
                cargo=pick(CARGO),
                weightKg=weight_kg,
                volumeM3=volume_m3,
                status=status,
                priority=priority,
                originCity=o.city,
                originLat=o.lat,
                originLng=o.lng,
                destCity=d.city,
                destLat=d.lat,
                destLng=d.lng,
                distanceKm=km,
                plannedDeparture=depart_ms,
                etaAt=eta_at_ms,
                assignedVehicleId=vehicle.id if vehicle is not None else None,
                assignedDriverId=driver.id if driver is not None else None,
                costInr=cost_inr,
                riskBand=risk_band,
                riskScore=risk_score,
                riskFactors=json.dumps(risk_factors, separators=(",", ":")),
                progress=progress,
                routeLabel=pick(["Balanced NH-48", "Fastest corridor", "Economy NH"]) if needs_vehicle else None,
                createdAt=min(depart_ms - 12 * HOUR, NOW - 2 * HOUR),
            )
            db.add(shipment)
            db.flush()

            # events
            events: list[ShipmentEvent] = []
            created_at = depart_ms - rand_int(10, 30) * HOUR
            events.append(ShipmentEvent(id=new_id(), shipmentId=shipment.id, at=created_at, type="Created", note=f"Shipment booked · {pickup(weight_kg)} of {shipment.cargo}", city=o.city))
            if status != "cancelled":
                events.append(ShipmentEvent(id=new_id(), shipmentId=shipment.id, at=created_at + 2 * HOUR, type="Scheduled", note="Slotted at origin hub", city=o.city))
            if needs_vehicle and vehicle is not None:
                events.append(ShipmentEvent(id=new_id(), shipmentId=shipment.id, at=created_at + 3 * HOUR, type="Assigned", note=f"AI ranked {vehicle.regNo} · score {rand_int(72, 94)}", city=o.city))
            if status in ("in_transit", "exception", "delivered"):
                events.append(ShipmentEvent(id=new_id(), shipmentId=shipment.id, at=depart_ms, type="In Transit", note=f"Departed {o.city} on {shipment.routeLabel}", city=o.city))
                if progress > 45:
                    events.append(ShipmentEvent(id=new_id(), shipmentId=shipment.id, at=depart_ms + transit_min * 0.4 * MIN, type="Checkpoint", note="Crossed toll plaza · on schedule", city=mid_city(o.city, d.city)))
            if status == "exception":
                events.append(ShipmentEvent(id=new_id(), shipmentId=shipment.id, at=depart_ms + transit_min * 0.5 * MIN, type="Exception", note="Unscheduled halt — driver reported corridor blockage", city=mid_city(o.city, d.city)))
            if status == "delivered":
                actual_delivery = eta_at_ms + rand_int(30, 240) * MIN if late_factor > 1 else eta_at_ms - rand_int(5, 60) * MIN
                events.append(ShipmentEvent(id=new_id(), shipmentId=shipment.id, at=actual_delivery, type="Delivered", note=f"Delivered at {d.city} · ePOD captured", city=d.city))
            if status == "cancelled":
                events.append(ShipmentEvent(id=new_id(), shipmentId=shipment.id, at=created_at + 5 * HOUR, type="Cancelled", note="Cancelled by customer before dispatch", city=o.city))
            db.add_all(events)

    # Guaranteed consolidation clusters (scheduled, same corridor + window).
    if vehicle_count >= 20:
        for cl in clusters:
            o, d = hub(cl["from"]), hub(cl["to"])
            km = distance_km(o.lat, o.lng, d.lat, d.lng)
            for i in range(cl["n"]):
                depart_ms = NOW + cl["atHour"] * HOUR + i * 20 * MIN
                eta_at_ms = depart_ms + ((km / 55) * 60 + 90) * 60_000
                weight_kg = 2200 + i * 900
                shipment = Shipment(
                    id=new_id(),
                    orgId=org_id,
                    ref=f"APA-26-{ref_counter}",
                    client=CLIENTS[(i + 3) % len(CLIENTS)],
                    cargo="FMCG pallets",
                    weightKg=weight_kg,
                    volumeM3=8 + i * 2.5,
                    status="scheduled",
                    priority="standard",
                    originCity=o.city,
                    originLat=o.lat,
                    originLng=o.lng,
                    destCity=d.city,
                    destLat=d.lat,
                    destLng=d.lng,
                    distanceKm=km,
                    plannedDeparture=depart_ms,
                    etaAt=eta_at_ms,
                    costInr=js_round(km * (118 + i * 6)),
                    riskBand="low",
                    riskScore=14 + i,
                    riskFactors=json.dumps(
                        [{"factor": "Schedule slack", "contribution": 10, "detail": f"Departure window opens in {cl['atHour']}h"}],
                        separators=(",", ":"),
                    ),
                    progress=0,
                    createdAt=NOW - 3 * HOUR,
                )
                ref_counter += 1
                db.add(shipment)
                db.flush()
                db.add(
                    ShipmentEvent(
                        id=new_id(),
                        shipmentId=shipment.id,
                        at=NOW - 3 * HOUR,
                        type="Created",
                        note=f"Shipment booked · {weight_kg / 1000:.1f}t of FMCG pallets",
                        city=o.city,
                    )
                )

    # vehicle statuses: in_use for active legs, some maintenance for the rest
    if vehicle_count >= 20:
        linked_rows = (
            db.query(Shipment.assignedVehicleId)
            .filter(Shipment.orgId == org_id, Shipment.status.in_(["in_transit", "assigned"]))
            .all()
        )
        linked = {r[0] for r in linked_rows if r[0]}
        for v in vehicles:
            if v.id in linked:
                v.status = "in_use"
                continue
            roll = rand()
            if roll < 0.09:
                v.status = "maintenance"
                continue
            unhealthy = db.query(Vehicle).filter(Vehicle.orgId == org_id, Vehicle.status == "maintenance").count()
            if unhealthy < 3 and roll > 0.93:
                v.status = "maintenance"

    # drivers on duty for in_transit legs
    on_duty_rows = (
        db.query(Shipment.assignedDriverId)
        .filter(Shipment.orgId == org_id, Shipment.status.in_(["in_transit", "assigned"]))
        .all()
    )
    on_duty = {r[0] for r in on_duty_rows if r[0]}
    for d_row in drivers:
        if d_row.id in on_duty:
            d_row.status = "on_duty"

    db.commit()
    return org


DISRUPTION_DEFS = [
    {
        "type": "weather", "severity": "critical", "title": "Monsoon flooding on Mumbai–Pune corridor",
        "corridor": "Mumbai–Pune", "note": "Waterlogging near Lonavala ghat section; trucks held at Talegaon plaza. Expect 3–5 h delays.",
        "status": "open", "steps": ["Hold affected dispatches at origin hub", "Re-route via NH-48 via Panvel with +4h buffer", "Notify consignees with revised ETAs", "Escalate to corridor lead if dwell > 60 min"],
    },
    {
        "type": "weather", "severity": "high", "title": "Dense fog band across Delhi–Ludhiana",
        "corridor": "Delhi–Ludhiana", "note": "Visibility under 80 m between Karnal and Ludhiana 04:00–09:00. Highway patrolling advised.",
        "status": "monitoring", "steps": ["Advise night halts for departures after 22:00", "Activate fog SOP — reduced convoy speed", "Update customer ETA +2h"],
    },
    {
        "type": "breakdown", "severity": "medium", "title": "Vehicle breakdown MH 12 QR 8841 — Nagpur–Hyderabad",
        "corridor": "Nagpur–Hyderabad", "note": "Rear axle failure near Adilabad. Load transshipment in progress.",
        "status": "open", "steps": ["Dispatch recovery van from Adilabad", "Transship load to standby vehicle", "Recalculate ETA and notify client"],
    },
    {
        "type": "strike", "severity": "high", "title": "Transport union strike — Kolkata docks",
        "corridor": "Kolkata–Chennai", "note": "Dock labour strike day 2. Container handover halted at Haldia gate.",
        "status": "open", "steps": ["Park inbound containers at WB hub", "Negotiate skeleton handling via broker", "Re-book sailings +24h", "Customer advisory bulletin"],
    },
    {
        "type": "traffic", "severity": "medium", "title": "Metro construction congestion — Chennai–Bengaluru NH-48",
        "corridor": "Bengaluru–Chennai", "note": "Diversion near Hoskotech adds 70–90 min during peak hours.",
        "status": "monitoring", "steps": ["Shift departures to off-peak window", "Enable toll-free alt route assessment"],
    },
    {
        "type": "regulatory", "severity": "low", "title": "GST checkpoint surge — Guwahati entry",
        "corridor": "Kolkata–Guwahati", "note": "Additional e-way bill verification at Srirampur checkpost; 30–45 min per truck.",
        "status": "resolved", "steps": ["Pre-file e-way bills for night batch", "Carry document folder backup copies"],
    },
]

RECS = [
    {"type": "route_switch", "refId": None, "title": "Switch APA-26-1042 to Economy NH route", "summary": "Re-route via NH-48 saves ₹6,800 and 1.4t CO₂ with only +55 min ETA.", "confidence": 0.88, "reasons": ["Tolls on current route ₹2.1/km vs ₹1.2/km", "Cargo is non-perishable — ETA tolerance high", "Traffic factor 0.65 on expressway section"], "impact": {"time_min": 55, "cost_inr": 6800, "co2_kg": 1400, "risk_delta": -6}},
    {"type": "consolidation", "refId": None, "title": "Consolidate 3 shipments Bengaluru → Chennai", "summary": "Combined 21.4t fits one 40ft trailer; saves one truck-day (~₹18,400).", "confidence": 0.91, "reasons": ["Same destination cluster within 12 h window", "Combined fill 84% weight / 78% volume", "All three clients accept pooled delivery"], "impact": {"cost_inr": 18400, "co2_kg": 610, "risk_delta": -2}},
    {"type": "assignment", "refId": None, "title": "Assign APA-26-1077 to KA 05 MQ 2210", "summary": "Best-ranked vehicle: 22 km deadhead, 81% fill, fresh duty window.", "confidence": 0.94, "reasons": ["Proximity 22 km (nearest capable unit)", "Capacity fit 81% — ideal window", "Driver hours fully available"], "impact": {"time_min": -40, "cost_inr": 2100, "risk_delta": -8}},
    {"type": "return_load", "refId": None, "title": "Return load for TS 11 AB 3390 (Hyderabad → Vijayawada)", "summary": "Steel coils load on return leg; detour 38 km, est. profit ₹9,300.", "confidence": 0.79, "reasons": ["Vehicle empties at Hyderabad 18:40", "Pickup within 40 km detour budget", "Profit margin 34% after detour cost"], "impact": {"cost_inr": 9300, "co2_kg": 0, "risk_delta": 0}},
    {"type": "maintenance", "refId": None, "title": "MH 12 QR 8841 — service due in 900 km", "summary": "Odometer 18,900 km since last service vs 20,000 km interval. Health trending down.", "confidence": 0.72, "reasons": ["Approaching 20,000 km service interval", "Health score 68 below 70 warn line", "Fuel efficiency dropped 12% vs baseline"], "impact": {"risk_delta": -12}},
    {"type": "fuel_anomaly", "refId": None, "title": "Fuel anomaly — GJ 01 KL 7723", "summary": "Consumption 4.6 km/l vs fleet baseline 3.6 km/l adjusted… inconsistent telematics pattern on Ahmedabad run.", "confidence": 0.63, "reasons": ["18% deviation above baseline threshold", "Two consecutive tanks on same corridor", "No route gradient explanation"], "impact": {"cost_inr": 5200, "risk_delta": 4}},
]

NOTES = [
    {"title": "Risk alert · APA-26-1061", "body": "Delay risk crossed high band — slack 38 min on Mumbai–Delhi.", "kind": "risk"},
    {"title": "Disruption · Mumbai–Pune flooding", "body": "Playbook step 1 auto-executed: 4 dispatches held at Bhiwandi hub.", "kind": "disruption"},
    {"title": "Assignment · APA-26-1077", "body": "Suggestion ready: KA 05 MQ 2210 ranked 94/100.", "kind": "assignment"},
    {"title": "Thresholds · config v3", "body": "Route scoring weights rebalanced by admin (co2 0.06 → 0.10).", "kind": "config"},
    {"title": "Maintenance · MH 12 QR 8841", "body": "Predictive flag: service due in 900 km. Slot a bay this week.", "kind": "maintenance"},
]


def main() -> None:
    print("Seeding demo data…")
    db = SessionLocal()
    try:
        org = seed_org(
            db,
            name="Meridian Freight Systems",
            slug="meridian",
            vehicle_count=32,
            driver_count=25,
            shipment_count=160,
            users=[
                {"name": "Priya Sharma", "email": "admin@meridian.in", "role": "ORG_ADMIN"},
                {"name": "Arjun Mehta", "email": "ops@meridian.in", "role": "OPS_MANAGER"},
                {"name": "Kavya Reddy", "email": "dispatcher@meridian.in", "role": "DISPATCHER"},
                {"name": "Rohit Patil", "email": "fleet@meridian.in", "role": "FLEET_MANAGER"},
                {"name": "Neha Gupta", "email": "analyst@meridian.in", "role": "ANALYST"},
            ],
        )
        org_id = org.id

        # Kalinga Carriers — org-isolation proof
        seed_org(
            db,
            name="Kalinga Carriers",
            slug="kalinga",
            vehicle_count=3,
            driver_count=2,
            shipment_count=8,
            users=[{"name": "Sibani Mishra", "email": "admin@kalinga.in", "role": "ORG_ADMIN"}],
            distribution={"delivered": 3, "in_transit": 2, "assigned": 1, "scheduled": 2},
        )

        # disruptions
        for i, d in enumerate(DISRUPTION_DEFS):
            corridor_parts = d["corridor"].split("–")
            affected = (
                db.query(Shipment)
                .filter(
                    Shipment.orgId == org_id,
                    Shipment.status.in_(["in_transit", "assigned"]),
                    (
                        ((Shipment.originCity == corridor_parts[0]) & (Shipment.destCity == corridor_parts[1]))
                        | ((Shipment.originCity == corridor_parts[1]) & (Shipment.destCity == corridor_parts[0]))
                    ),
                )
                .count()
            )
            db.add(
                Disruption(
                    id=new_id(),
                    orgId=org_id,
                    type=d["type"],
                    severity=d["severity"],
                    title=d["title"],
                    corridor=d["corridor"],
                    note=d["note"],
                    status=d["status"],
                    affectedCount=max(affected, 1),
                    steps=json.dumps(d["steps"], separators=(",", ":")),
                    stepIndex=1 if d["status"] == "monitoring" else (len(d["steps"]) if d["status"] == "resolved" else 0),
                    log=json.dumps(
                        [{"at": datetime.fromtimestamp((NOW - (i + 1) * 3 * HOUR) / 1000, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"), "entry": "Incident auto-detected from corridor telemetry (demo)"}],
                        separators=(",", ":"),
                    ),
                    createdAt=NOW - (i + 1) * 3 * HOUR,
                    resolvedAt=NOW - i * HOUR if d["status"] == "resolved" else None,
                )
            )

        # recommendations
        for r in RECS:
            db.add(
                Recommendation(
                    id=new_id(),
                    orgId=org_id,
                    type=r["type"],
                    refId=r["refId"],
                    title=r["title"],
                    summary=r["summary"],
                    confidence=r["confidence"],
                    reasons=json.dumps(r["reasons"], separators=(",", ":")),
                    impact=json.dumps(r["impact"], separators=(",", ":")),
                    status="pending",
                    dataStatus="rule_based",
                )
            )

        # notifications
        for i, n in enumerate(NOTES):
            db.add(
                Notification(
                    id=new_id(),
                    orgId=org_id,
                    title=n["title"],
                    body=n["body"],
                    kind=n["kind"],
                    read=1 if i > 2 else 0,
                    createdAt=NOW - (i + 1) * 40 * MIN,
                )
            )

        # threshold config v1
        defaults = default_thresholds()
        row = db.execute(select(ThresholdConfig).where(ThresholdConfig.orgId == org_id)).scalar_one_or_none()
        payload = json.dumps(defaults, separators=(",", ":"))
        if row is None:
            db.add(ThresholdConfig(id=new_id(), orgId=org_id, json=payload, version=1, configHash=config_hash(defaults), updatedBy="system"))
        else:
            row.json = payload
            row.version = 1
            row.configHash = config_hash(defaults)
            row.updatedBy = "system"

        db.commit()

        v_count = db.query(Vehicle).filter(Vehicle.orgId == org_id).count()
        d_count = db.query(Driver).filter(Driver.orgId == org_id).count()
        s_count = db.query(Shipment).filter(Shipment.orgId == org_id).count()
        e_count = (
            db.query(ShipmentEvent)
            .join(Shipment, ShipmentEvent.shipmentId == Shipment.id)
            .filter(Shipment.orgId == org_id)
            .count()
        )

        print(
            "\n──────────────────────────────────────────────────────\n"
            "  Demo seed complete ✓\n"
            "  Org A  Meridian Freight Systems (slug: meridian)\n"
            f"         {v_count} vehicles · {d_count} drivers · {s_count} shipments · {e_count} events\n"
            "  Org B  Kalinga Carriers (slug: kalinga) — isolation demo\n"
            "\n"
            "  Demo credentials (password for all: Demo@12345)\n"
            "    admin@meridian.in       Org Admin        (Priya Sharma)\n"
            "    ops@meridian.in         Ops Manager      (Arjun Mehta)\n"
            "    dispatcher@meridian.in  Dispatcher       (Kavya Reddy)\n"
            "    fleet@meridian.in       Fleet Manager    (Rohit Patil)\n"
            "    analyst@meridian.in     Analyst (RO)     (Neha Gupta)\n"
            "    admin@kalinga.in        Org Admin B      (isolation proof)\n"
            "──────────────────────────────────────────────────────"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
