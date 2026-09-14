"""Indian logistics hub network — coordinates, corridor distances, toll density.

Verbatim port of `src/lib/hubs.ts` (data copied 1:1 so distances and corridor
profiles match the Next.js implementation exactly).
"""
from __future__ import annotations

import math
from dataclasses import dataclass


class UnknownHubError(KeyError):
    """Raised when a city is not part of the hub network."""

    def __init__(self, city: str) -> None:
        super().__init__(city)
        self.city = city

    def __str__(self) -> str:  # message must start with "Unknown hub" (API maps it to INVALID_HUB)
        return f"Unknown hub: {self.city}"


@dataclass(frozen=True)
class Hub:
    city: str
    state: str
    lat: float
    lng: float


HUBS: tuple[Hub, ...] = (
    Hub("Mumbai", "Maharashtra", 19.076, 72.8777),
    Hub("Pune", "Maharashtra", 18.5204, 73.8567),
    Hub("Nashik", "Maharashtra", 19.9975, 73.7898),
    Hub("Nagpur", "Maharashtra", 21.1458, 79.0882),
    Hub("Delhi", "Delhi NCR", 28.6139, 77.209),
    Hub("Gurugram", "Haryana", 28.4595, 77.0266),
    Hub("Jaipur", "Rajasthan", 26.9124, 75.7873),
    Hub("Ahmedabad", "Gujarat", 23.0225, 72.5714),
    Hub("Surat", "Gujarat", 21.1702, 72.8311),
    Hub("Ludhiana", "Punjab", 30.901, 75.8573),
    Hub("Kolkata", "West Bengal", 22.5726, 88.3639),
    Hub("Bhubaneswar", "Odisha", 20.2961, 85.8245),
    Hub("Raipur", "Chhattisgarh", 21.2514, 81.6296),
    Hub("Hyderabad", "Telangana", 17.385, 78.4867),
    Hub("Vijayawada", "Andhra Pradesh", 16.5062, 80.648),
    Hub("Bengaluru", "Karnataka", 12.9716, 77.5946),
    Hub("Chennai", "Tamil Nadu", 13.0827, 80.2707),
    Hub("Coimbatore", "Tamil Nadu", 11.0168, 76.9558),
    Hub("Kochi", "Kerala", 9.9312, 76.2673),
    Hub("Indore", "Madhya Pradesh", 22.7196, 75.8577),
    Hub("Kanpur", "Uttar Pradesh", 26.4499, 80.3319),
    Hub("Guwahati", "Assam", 26.1445, 91.7362),
)

_HUBS_BY_LOWER: dict[str, Hub] = {h.city.lower(): h for h in HUBS}


def hub(city: str) -> Hub:
    """Look up a hub by city name (case-insensitive). Raises UnknownHubError."""
    h = _HUBS_BY_LOWER.get(city.lower())
    if h is None:
        raise UnknownHubError(city)
    return h


def has_hub(city: str) -> bool:
    return city.lower() in _HUBS_BY_LOWER


def distance_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> int:
    """Great-circle distance in km with the 1.18 road factor (as in hubs.ts)."""
    r = 6371.0
    d_lat = math.radians(b_lat - a_lat)
    d_lng = math.radians(b_lng - a_lng)
    s = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(a_lat)) * math.cos(math.radians(b_lat)) * math.sin(d_lng / 2) ** 2
    )
    return round(2 * r * math.asin(math.sqrt(s)) * 1.18)


@dataclass(frozen=True)
class CorridorDef:
    from_city: str
    to_city: str
    toll_density: float  # 0..1
    congestion: float  # 0..1
    weather_risk: float  # 0..1 seasonal


CORRIDORS: tuple[CorridorDef, ...] = (
    CorridorDef("Mumbai", "Pune", 0.8, 0.65, 0.55),
    CorridorDef("Mumbai", "Delhi", 0.75, 0.6, 0.35),
    CorridorDef("Mumbai", "Bengaluru", 0.7, 0.55, 0.3),
    CorridorDef("Delhi", "Kolkata", 0.65, 0.5, 0.5),
    CorridorDef("Bengaluru", "Chennai", 0.7, 0.5, 0.4),
    CorridorDef("Delhi", "Jaipur", 0.6, 0.45, 0.25),
    CorridorDef("Hyderabad", "Bengaluru", 0.6, 0.4, 0.3),
    CorridorDef("Kolkata", "Chennai", 0.5, 0.45, 0.6),
    CorridorDef("Ahmedabad", "Mumbai", 0.65, 0.55, 0.3),
    CorridorDef("Nagpur", "Hyderabad", 0.5, 0.35, 0.35),
    CorridorDef("Delhi", "Ludhiana", 0.55, 0.5, 0.45),
    CorridorDef("Coimbatore", "Kochi", 0.4, 0.35, 0.5),
    CorridorDef("Kolkata", "Guwahati", 0.35, 0.3, 0.65),
    CorridorDef("Mumbai", "Kolkata", 0.6, 0.5, 0.45),
    CorridorDef("Chennai", "Kochi", 0.45, 0.35, 0.5),
)
