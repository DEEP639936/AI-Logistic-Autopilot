"""Shared domain constants: roles, shipment status machine, vehicle types.

Port of `src/lib/types.ts`. SESSION_COOKIE is load-bearing — the Next.js API
and this service must read the same cookie so clients can switch backends.
"""
from __future__ import annotations

from typing import Final, Literal, get_args

ROLES: Final = ("ORG_ADMIN", "OPS_MANAGER", "DISPATCHER", "FLEET_MANAGER", "ANALYST", "DRIVER", "CUSTOMER")
Role = Literal["ORG_ADMIN", "OPS_MANAGER", "DISPATCHER", "FLEET_MANAGER", "ANALYST", "DRIVER", "CUSTOMER"]

ROLE_LABELS: Final[dict[str, str]] = {
    "ORG_ADMIN": "Org Admin",
    "OPS_MANAGER": "Operations Manager",
    "DISPATCHER": "Dispatcher",
    "FLEET_MANAGER": "Fleet Manager",
    "ANALYST": "Analyst",
    "DRIVER": "Driver",
    "CUSTOMER": "Consignee",
}

#: Roles allowed to mutate (write) operations data.
WRITE_ROLES: Final[tuple[str, ...]] = ("ORG_ADMIN", "OPS_MANAGER", "DISPATCHER", "FLEET_MANAGER")

SHIPMENT_STATUSES: Final = ("draft", "scheduled", "assigned", "in_transit", "delivered", "cancelled", "exception")
ShipmentStatus = Literal["draft", "scheduled", "assigned", "in_transit", "delivered", "cancelled", "exception"]

#: Allowed transitions, verbatim from src/lib/types.ts.
STATUS_MACHINE: Final[dict[str, tuple[str, ...]]] = {
    "draft": ("scheduled", "cancelled"),
    "scheduled": ("assigned", "cancelled"),
    "assigned": ("in_transit", "scheduled", "cancelled"),
    "in_transit": ("delivered", "exception"),
    "exception": ("in_transit", "cancelled"),
    "delivered": (),
    "cancelled": (),
}

STATUS_LABELS: Final[dict[str, str]] = {
    "draft": "Draft",
    "scheduled": "Scheduled",
    "assigned": "Assigned",
    "in_transit": "In Transit",
    "delivered": "Delivered",
    "cancelled": "Cancelled",
    "exception": "Exception",
}

RiskBand = Literal["low", "medium", "high", "critical"]
DataStatus = Literal["live", "demo", "mock", "rule_based", "optimization", "planned"]

VehicleTypePair = tuple[str, str, int, float]


class VehicleType:
    """Static vehicle catalogue entry (id, label, capacityKg, capacityM3)."""

    __slots__ = ("id", "label", "capacityKg", "capacityM3")

    def __init__(self, id: str, label: str, capacityKg: int, capacityM3: float) -> None:
        self.id = id
        self.label = label
        self.capacityKg = capacityKg
        self.capacityM3 = capacityM3


VEHICLE_TYPES: Final[tuple[VehicleType, ...]] = (
    VehicleType("TRAILER_40", "40ft Trailer", 28000, 68),
    VehicleType("CONTAINER_32", "32ft SXL Container", 18000, 45),
    VehicleType("REEFER_32", "32ft Reefer", 16000, 42),
    VehicleType("TRUCK_24", "24ft Truck", 9000, 28),
    VehicleType("MINI_TRUCK", "Mini Truck", 3500, 14),
)


def type_label_for(vehicle_type: str) -> str:
    """UI label for a vehicle type id (falls back to the raw id)."""
    for vt in VEHICLE_TYPES:
        if vt.id == vehicle_type:
            return vt.label
    return vehicle_type


APP_NAME: Final = "Logistics Autopilot"
SESSION_COOKIE: Final = "apaas_session"

SHIPMENT_STATUS_VALUES: Final[tuple[str, ...]] = get_args(ShipmentStatus)
