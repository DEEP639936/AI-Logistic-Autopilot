"""SQLAlchemy ORM models mirroring the Prisma schema EXACTLY.

Every `__tablename__` and every column name is verbatim from
`prisma/schema.prisma` (camelCase, e.g. table "User" with columns
"passwordHash" / "orgId"). Attribute names are intentionally camelCase as
well so row objects map onto the API DTOs with zero translation bugs —
this file is the single source of DB-shape truth for the Python backend.

DateTime columns are `BigInteger` milliseconds-since-epoch because that is
how Prisma's SQLite connector persists `DateTime` (verified empirically).
Booleans are `Integer` 0/1 (same verification).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import BigInteger, Float, Integer, String, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, to_ms


def _utcnow_ms() -> int:
    return to_ms(datetime.now(timezone.utc))


class Organization(Base):
    __tablename__ = "Organization"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    plan: Mapped[str] = mapped_column(String, nullable=False, default="growth")
    demo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    createdAt: Mapped[int] = mapped_column("createdAt", BigInteger, nullable=False, default=_utcnow_ms)


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    orgId: Mapped[str] = mapped_column(String, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    passwordHash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="OPS_MANAGER")
    createdAt: Mapped[int] = mapped_column("createdAt", BigInteger, nullable=False, default=_utcnow_ms)


class Session(Base):
    __tablename__ = "Session"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    userId: Mapped[str] = mapped_column(String, nullable=False, index=True)
    token: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    expiresAt: Mapped[int] = mapped_column("expiresAt", BigInteger, nullable=False)
    createdAt: Mapped[int] = mapped_column("createdAt", BigInteger, nullable=False, default=_utcnow_ms)


class Vehicle(Base):
    __tablename__ = "Vehicle"
    __table_args__ = (Index("Vehicle_orgId_status_idx", "orgId", "status"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    orgId: Mapped[str] = mapped_column(String, nullable=False)
    regNo: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    capacityKg: Mapped[int] = mapped_column(Integer, nullable=False)
    capacityM3: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="available")
    healthScore: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    odometerKm: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lastServiceOdometerKm: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fuelEffKmpl: Mapped[float] = mapped_column(Float, nullable=False, default=3.4)
    currentCity: Mapped[str] = mapped_column(String, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    updatedAt: Mapped[int] = mapped_column(BigInteger, nullable=False, default=_utcnow_ms, onupdate=_utcnow_ms)


class Driver(Base):
    __tablename__ = "Driver"
    __table_args__ = (Index("Driver_orgId_status_idx", "orgId", "status"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    orgId: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, nullable=False)
    licenseNo: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="available")
    hoursToday: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rating: Mapped[float] = mapped_column(Float, nullable=False, default=4.5)
    trips: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    onTimePct: Mapped[float] = mapped_column(Float, nullable=False, default=92)
    createdAt: Mapped[int] = mapped_column("createdAt", BigInteger, nullable=False, default=_utcnow_ms)


class Shipment(Base):
    __tablename__ = "Shipment"
    __table_args__ = (
        UniqueConstraint("orgId", "ref", name="Shipment_orgId_ref_key"),
        Index("Shipment_orgId_status_idx", "orgId", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    orgId: Mapped[str] = mapped_column(String, nullable=False)
    ref: Mapped[str] = mapped_column(String, nullable=False)
    client: Mapped[str] = mapped_column(String, nullable=False)
    cargo: Mapped[str] = mapped_column(String, nullable=False)
    weightKg: Mapped[int] = mapped_column(Integer, nullable=False)
    volumeM3: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="scheduled")
    priority: Mapped[str] = mapped_column(String, nullable=False, default="standard")
    originCity: Mapped[str] = mapped_column(String, nullable=False)
    originLat: Mapped[float] = mapped_column(Float, nullable=False)
    originLng: Mapped[float] = mapped_column(Float, nullable=False)
    destCity: Mapped[str] = mapped_column(String, nullable=False)
    destLat: Mapped[float] = mapped_column(Float, nullable=False)
    destLng: Mapped[float] = mapped_column(Float, nullable=False)
    distanceKm: Mapped[int] = mapped_column(Integer, nullable=False)
    plannedDeparture: Mapped[int] = mapped_column(BigInteger, nullable=False)
    etaAt: Mapped[int] = mapped_column(BigInteger, nullable=False)
    assignedVehicleId: Mapped[str | None] = mapped_column(String, nullable=True)
    assignedDriverId: Mapped[str | None] = mapped_column(String, nullable=True)
    costInr: Mapped[int] = mapped_column(Integer, nullable=False)
    riskBand: Mapped[str] = mapped_column(String, nullable=False, default="low")
    riskScore: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    riskFactors: Mapped[str] = mapped_column(String, nullable=False, default="[]")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    routeLabel: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[int] = mapped_column("createdAt", BigInteger, nullable=False, default=_utcnow_ms)
    updatedAt: Mapped[int] = mapped_column(BigInteger, nullable=False, default=_utcnow_ms, onupdate=_utcnow_ms)

    #: Prisma `assignedVehicle` relation (SHIPMENT_INCLUDE) — read-only convenience.
    assignedVehicle: Mapped[Optional["Vehicle"]] = relationship(
        "Vehicle",
        foreign_keys=[assignedVehicleId],
        primaryjoin="Shipment.assignedVehicleId==Vehicle.id",
        lazy="select",
    )


class ShipmentEvent(Base):
    __tablename__ = "ShipmentEvent"
    __table_args__ = (Index("ShipmentEvent_shipmentId_idx", "shipmentId"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    shipmentId: Mapped[str] = mapped_column(String, nullable=False)
    at: Mapped[int] = mapped_column(BigInteger, nullable=False, default=_utcnow_ms)
    type: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str] = mapped_column(String, nullable=False)
    city: Mapped[str | None] = mapped_column(String, nullable=True)


class Recommendation(Base):
    __tablename__ = "Recommendation"
    __table_args__ = (Index("Recommendation_orgId_status_idx", "orgId", "status"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    orgId: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    refId: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    summary: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    reasons: Mapped[str] = mapped_column(String, nullable=False, default="[]")
    impact: Mapped[str] = mapped_column(String, nullable=False, default="{}")
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    dataStatus: Mapped[str] = mapped_column(String, nullable=False, default="rule_based")
    createdAt: Mapped[int] = mapped_column("createdAt", BigInteger, nullable=False, default=_utcnow_ms)
    decidedAt: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class Disruption(Base):
    __tablename__ = "Disruption"
    __table_args__ = (Index("Disruption_orgId_status_idx", "orgId", "status"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    orgId: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False, default="medium")
    title: Mapped[str] = mapped_column(String, nullable=False)
    corridor: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str] = mapped_column(String, nullable=False, default="")
    status: Mapped[str] = mapped_column(String, nullable=False, default="open")
    affectedCount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    steps: Mapped[str] = mapped_column(String, nullable=False, default="[]")
    stepIndex: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    log: Mapped[str] = mapped_column(String, nullable=False, default="[]")
    createdAt: Mapped[int] = mapped_column("createdAt", BigInteger, nullable=False, default=_utcnow_ms)
    resolvedAt: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class ThresholdConfig(Base):
    __tablename__ = "ThresholdConfig"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    orgId: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    json: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    configHash: Mapped[str] = mapped_column(String, nullable=False)
    updatedAt: Mapped[int] = mapped_column(BigInteger, nullable=False, default=_utcnow_ms, onupdate=_utcnow_ms)
    updatedBy: Mapped[str | None] = mapped_column(String, nullable=True)


class Notification(Base):
    __tablename__ = "Notification"
    __table_args__ = (Index("Notification_orgId_read_idx", "orgId", "read"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    orgId: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False, default="info")
    read: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    createdAt: Mapped[int] = mapped_column("createdAt", BigInteger, nullable=False, default=_utcnow_ms)


class DemoRequest(Base):
    __tablename__ = "DemoRequest"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    org: Mapped[str] = mapped_column(String, nullable=False)
    fleetSize: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(String, nullable=False, default="")
    createdAt: Mapped[int] = mapped_column("createdAt", BigInteger, nullable=False, default=_utcnow_ms)


class RoadLeg(Base):
    """Read-through cache for live road-routing legs (BRouter/OSRM over OSM)."""

    __tablename__ = "RoadLeg"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    pairKey: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    km: Mapped[float] = mapped_column(Float, nullable=False)
    durationMin: Mapped[int] = mapped_column(Integer, nullable=False)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    fetchedAt: Mapped[int] = mapped_column(BigInteger, nullable=False, default=_utcnow_ms)


__all__ = [
    "Organization",
    "User",
    "Session",
    "Vehicle",
    "Driver",
    "Shipment",
    "ShipmentEvent",
    "Recommendation",
    "Disruption",
    "ThresholdConfig",
    "Notification",
    "DemoRequest",
    "RoadLeg",
    "now_ms",
]
