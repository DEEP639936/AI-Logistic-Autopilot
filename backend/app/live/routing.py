"""LIVE ROAD ROUTING — true road-network distances & durations over OSM.

Port of `src/lib/live/routing.ts` onto httpx (async), with the same provider
failover chain:

  1. BRouter (https://brouter.de) — open-source router on OSM, `car-fast`
     profile (primary; works from most server environments).
  2. OSRM demo server (https://router.project-osrm.org) — car profile
     (fallback; some hosts block its edge TLS).

Legs are cached in memory for 24 h (the road graph is static), failures for
5 min, every call is timeout-guarded, and successes are persisted to the
RoadLeg table (read-through, 24h+) so restarts never re-hit the public
routers. On total failure the caller receives `None` and must fall back to
its own deterministic estimate and label it honestly.
"""
from __future__ import annotations

import asyncio
import math
import time
import warnings
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session as OrmSession

from ..ids import new_id
from ..models import RoadLeg

ROUTING_SOURCE = "BRouter · OpenStreetMap"
ROUTING_SOURCE_URL = "https://brouter.de"
ROUTING_ATTRIBUTION = "Real road data · BRouter (OpenStreetMap)"

_TTL_S = 24 * 60 * 60
_NEG_TTL_S = 4 * 60
_TIMEOUT_S = 10.0
_MAX_CONCURRENT = 2  # fair-use: public routers throttle bursts
_RETRY_DELAY_S = 1.2

_cache: dict[str, tuple[float, "RoadRoute | None"]] = {}
_gate = asyncio.Semaphore(_MAX_CONCURRENT)
_user_agent = "LogisticsAutopilot/1.0 (logistics demo; contact: ops@meridian.in)"


class RoadRoute(dict):
    """{km: float, durationMin: int, provider: str} — dict subclass for JSON ease."""

    def __init__(self, km: float, duration_min: int, provider: str) -> None:
        super().__init__(km=km, durationMin=duration_min, provider=provider)

    @property
    def km(self) -> float:
        return self["km"]  # type: ignore[return-value]

    @property
    def duration_min(self) -> int:
        return self["durationMin"]  # type: ignore[return-value]


def pair_key(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> str:
    """Order-independent: Mumbai→Pune and Pune→Mumbai share one cache entry."""
    a = f"{a_lat:.4f},{a_lng:.4f}"
    b = f"{b_lat:.4f},{b_lng:.4f}"
    return "=>".join(sorted([a, b]))


def _js_round(v: float) -> int:
    return int(math.floor(v + 0.5))


async def _fetch_json(client: httpx.AsyncClient, url: str, provider: str) -> Any:
    res = await client.get(url, headers={"User-Agent": _user_agent})
    if res.status_code >= 400:
        raise RuntimeError(f"{provider} responded {res.status_code}")
    return res.json()


async def _via_brouter(client: httpx.AsyncClient, a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> RoadRoute:
    url = (
        f"https://brouter.de/brouter?lonlats={a_lng:.4f},{a_lat:.4f}|{b_lng:.4f},{b_lat:.4f}"
        "&profile=car-fast&alternativeidx=0&format=geojson"
    )
    payload = await _fetch_json(client, url, "BRouter")
    features = payload.get("features") or []
    props = features[0].get("properties", {}) if features else {}
    metres = float(props.get("track-length") or 0)
    seconds = float(props.get("total-time") or 0)
    if not (math.isfinite(metres) and metres > 0 and math.isfinite(seconds) and seconds > 0):
        raise RuntimeError("BRouter payload missing track metrics")
    return RoadRoute(km=_round1(metres / 1000), duration_min=max(1, _js_round(seconds / 60)), provider="brouter")


async def _via_osrm(client: httpx.AsyncClient, a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> RoadRoute:
    coords = f"{a_lng:.5f},{a_lat:.5f};{b_lng:.5f},{b_lat:.5f}"
    url = f"https://router.project-osrm.org/route/v1/driving/{coords}?overview=false&alternatives=false&steps=false"
    payload = await _fetch_json(client, url, "OSRM")
    routes = payload.get("routes") or []
    route = routes[0] if routes else None
    if payload.get("code") != "Ok" or not route or not isinstance(route.get("distance"), (int, float)):
        raise RuntimeError("OSRM payload missing route")
    return RoadRoute(
        km=_round1(route["distance"] / 1000),
        duration_min=max(1, _js_round(route["duration"] / 60)),
        provider="osrm",
    )


def _round1(v: float) -> float:
    return _js_round(v * 10) / 10


def _db_lookup(db: OrmSession, key: str) -> RoadRoute | None:
    """Read-through: road facts are static, so a persisted leg never refetches."""
    try:
        row = db.execute(select(RoadLeg).where(RoadLeg.pairKey == key)).scalar_one_or_none()
        if row is not None:
            return RoadRoute(km=row.km, duration_min=row.durationMin, provider="osrm" if row.provider == "osrm" else "brouter")
    except Exception:  # noqa: BLE001 — cache lookup failure must never break routing
        pass
    return None


def _db_upsert(db: OrmSession, key: str, data: RoadRoute) -> None:
    from ..database import now_ms

    try:
        row = db.execute(select(RoadLeg).where(RoadLeg.pairKey == key)).scalar_one_or_none()
        if row is None:
            db.add(
                RoadLeg(
                    id=new_id(),
                    pairKey=key,
                    km=data.km,
                    durationMin=data.duration_min,
                    provider=data["provider"],
                    fetchedAt=now_ms(),
                )
            )
        else:
            row.km = data.km
            row.durationMin = data.duration_min
            row.provider = data["provider"]
            row.fetchedAt = now_ms()
        db.commit()
    except Exception:  # noqa: BLE001 — cache write failure must never break routing
        db.rollback()


async def road_route(
    db: OrmSession,
    a_lat: float,
    a_lng: float,
    b_lat: float,
    b_lng: float,
    deadline_ms: int = 45_000,
) -> RoadRoute | None:
    """Real driving distance/duration with provider failover; None on total failure."""
    key = pair_key(a_lat, a_lng, b_lat, b_lng)
    hit = _cache.get(key)
    if hit is not None:
        at, data = hit
        ttl = _TTL_S if data is not None else _NEG_TTL_S
        if time.monotonic() - at < ttl:
            return data

    row = _db_lookup(db, key)
    if row is not None:
        _cache[key] = (time.monotonic(), row)
        return row

    deadline = time.monotonic() + max(4.0, deadline_ms / 1000)
    data: RoadRoute | None = None
    async with _gate:
        for attempt in range(3):
            if attempt > 0:
                await asyncio.sleep(_RETRY_DELAY_S * attempt)
            if time.monotonic() >= deadline:
                break
            async with httpx.AsyncClient(timeout=_TIMEOUT_S, verify=True) as client:
                try:
                    data = await _via_brouter(client, a_lat, a_lng, b_lat, b_lng)
                except (httpx.HTTPError, RuntimeError, ValueError, KeyError, TypeError):
                    if time.monotonic() >= deadline:
                        break
                    try:
                        data = await _via_osrm(client, a_lat, a_lng, b_lat, b_lng)
                    except (httpx.HTTPError, RuntimeError, ValueError, KeyError, TypeError):
                        continue
            if data is not None:
                break
        # (gate released after persistence below)

    if data is None:
        # Degraded mode stays visible to operators — honest fallback, not silence.
        warnings.warn("[routing] live road data unavailable: both routing providers unreachable")
    else:
        _db_upsert(db, key, data)

    _cache[key] = (time.monotonic(), data)
    return data


async def road_legs(
    db: OrmSession,
    points: list[dict[str, float]],
    deadline_ms: int = 45_000,
) -> list[RoadRoute | None]:
    """Real road legs for an origin → via → destination chain, computed in parallel."""
    jobs = [
        road_route(db, points[i]["lat"], points[i]["lng"], points[i + 1]["lat"], points[i + 1]["lng"], deadline_ms)
        for i in range(len(points) - 1)
    ]
    return list(await asyncio.gather(*jobs))


async def road_legs_by_rank(
    db: OrmSession,
    origin: dict[str, float],
    mids: list[dict[str, float]],
    dest: dict[str, float],
    deadline_ms: int = 45_000,
) -> list[list[dict[str, int | float] | None]]:
    """Fetch every leg for every alternative rank, with a healing second pass."""
    chains = [[origin, m, dest] for m in mids]
    first = await asyncio.gather(*(road_legs(db, pts, deadline_ms) for pts in chains))

    heal_deadline = time.monotonic() + (deadline_ms / 1000) / 2 if deadline_ms else 20.0
    healed: list[list[dict[str, int | float] | None]] = []
    for rank, legs in enumerate(first):
        out: list[dict[str, int | float] | None] = []
        for i, leg in enumerate(legs):
            if leg is not None:
                out.append({"km": leg.km, "durationMin": leg.duration_min})
            elif time.monotonic() < heal_deadline:
                a, b = chains[rank][i], chains[rank][i + 1]
                retry = await road_route(db, a["lat"], a["lng"], b["lat"], b["lng"], deadline_ms=max(4000, int((heal_deadline - time.monotonic()) * 1000)))
                out.append({"km": retry.km, "durationMin": retry.duration_min} if retry else None)
            else:
                out.append(None)
        healed.append(out)
    return healed
