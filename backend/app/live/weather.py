"""LIVE WEATHER — real conditions from Open-Meteo (https://open-meteo.com).

Port of `src/lib/live/weather.ts` onto httpx (async).

Source: Open-Meteo public forecast API (free, keyless). Data comes from
national weather services' forecast models (ECMWF/GFS/ICON blend), refreshed
every ~15 minutes by the provider.

Every consumer must surface `WEATHER_ATTRIBUTION` in the UI so operators can
tell live inputs from seasonal baselines. Calls are cached in memory
(15 min TTL; failures negatively cached 5 min) and degrade gracefully: on
timeout/error the caller receives `None` and falls back to the static
seasonal corridor profile.
"""
from __future__ import annotations

import asyncio
import math
import time
from dataclasses import dataclass
from typing import Any

import httpx

WEATHER_SOURCE = "Open-Meteo"
WEATHER_SOURCE_URL = "https://open-meteo.com"
WEATHER_ATTRIBUTION = "Live weather · Open-Meteo"

_TTL_S = 15 * 60
_NEG_TTL_S = 5 * 60
_TIMEOUT_S = 7.0

_cache: dict[str, tuple[float, "HubWeather | None"]] = {}
_lock = asyncio.Lock()


@dataclass(frozen=True)
class HubWeather:
    city: str
    tempC: float
    precipMm: float
    windKph: float
    code: int
    label: str
    precipTodayMm: float
    risk: float
    fetchedAt: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "city": self.city,
            "tempC": self.tempC,
            "precipMm": self.precipMm,
            "windKph": self.windKph,
            "code": self.code,
            "label": self.label,
            "precipTodayMm": self.precipTodayMm,
            "risk": self.risk,
            "fetchedAt": self.fetchedAt,
        }


def interpret_wmo(code: int, precip_mm: float) -> tuple[str, float]:
    """WMO weather-code → (label, risk) for road freight impact."""
    if code == 0:
        return "Clear sky", 0.02
    if code == 1:
        return "Mainly clear", 0.04
    if code == 2:
        return "Partly cloudy", 0.05
    if code == 3:
        return "Overcast", 0.08
    if code in (45, 48):
        return "Fog", 0.85
    if 51 <= code <= 55:
        return "Drizzle", 0.22
    if code in (56, 57):
        return "Freezing drizzle", 0.5
    if code == 61:
        return "Slight rain", 0.35
    if code == 63:
        return "Moderate rain", 0.55
    if code == 65:
        return "Heavy rain", 0.8
    if code in (66, 67):
        return "Freezing rain", 0.75
    if 71 <= code <= 77:
        return "Snow", 0.85
    if code == 80:
        return "Rain showers", 0.4
    if code == 81:
        return "Heavy showers", 0.6
    if code == 82:
        return "Violent showers", 0.85
    if code in (85, 86):
        return "Snow showers", 0.85
    if code == 95:
        return "Thunderstorm", 0.9
    if code in (96, 99):
        return "Thunderstorm · hail", 0.95
    # Unknown code — fall back to rain intensity.
    if precip_mm >= 7.5:
        return "Heavy rain", 0.8
    if precip_mm >= 2.5:
        return "Moderate rain", 0.55
    if precip_mm > 0:
        return "Light rain", 0.3
    return "Conditions OK", 0.08


def _iso_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _round1(v: float) -> float:
    """JS Math.round(v * 10) / 10 (half toward +Infinity)."""
    return math.floor(v * 10 + 0.5) / 10


def _round2(v: float) -> float:
    """JS Math.round(x*100)/100 — risk values keep 2-decimal precision."""
    return math.floor(v * 100 + 0.5) / 100


async def fetch_hub_weather(city: str, lat: float, lng: float) -> HubWeather | None:
    """Fetch real current weather for a hub; None when the service is unreachable."""
    key = city.lower()
    async with _lock:
        hit = _cache.get(key)
        if hit is not None:
            at, data = hit
            ttl = _TTL_S if data is not None else _NEG_TTL_S
            if time.monotonic() - at < ttl:
                return data

    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={lat:.4f}&longitude={lng:.4f}"
        "&current=temperature_2m,precipitation,weather_code,wind_speed_10m"
        "&daily=precipitation_sum&forecast_days=1&timezone=Asia%2FKolkata"
    )
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            res = await client.get(url)
            res.raise_for_status()
            payload: dict[str, Any] = res.json()
        cur = payload.get("current")
        if not cur:
            raise ValueError("Open-Meteo payload missing `current`")

        temp_c = float(cur.get("temperature_2m") or 0)
        precip_mm = float(cur.get("precipitation") or 0)
        code = int(cur.get("weather_code") or 0)
        wind_kph = float(cur.get("wind_speed_10m") or 0)
        label, risk = interpret_wmo(code, precip_mm)
        # Escalate risk slightly when today's forecast totals are high (sustained rain).
        precip_today = float((payload.get("daily", {}).get("precipitation_sum") or [0])[0])
        escalated = risk + (0.1 if precip_today >= 35 else 0.05 if precip_today >= 15 else 0)
        wind_boost = 0.08 if wind_kph >= 40 else 0.04 if wind_kph >= 30 else 0

        data = HubWeather(
            city=city,
            tempC=_round1(temp_c),
            precipMm=_round1(precip_mm),
            windKph=_round1(wind_kph),
            code=code,
            label=label,
            precipTodayMm=_round1(precip_today),
            risk=min(1, _round2(min(1.0, escalated) + wind_boost)),
            fetchedAt=_iso_now(),
        )
        async with _lock:
            _cache[key] = (time.monotonic(), data)
        return data
    except (httpx.HTTPError, ValueError, TypeError, IndexError):
        async with _lock:
            _cache[key] = (time.monotonic(), None)
        return None


async def corridor_weather(
    o: dict[str, float], d: dict[str, float]
) -> dict[str, Any] | None:
    """Live corridor weather = worse of the two ends. None when offline."""
    a, b = await asyncio.gather(
        fetch_hub_weather(o["city"], o["lat"], o["lng"]),
        fetch_hub_weather(d["city"], d["lat"], d["lng"]),
    )
    ends = [x for x in (a, b) if x is not None]
    if not ends:
        return None
    worst = max(ends, key=lambda x: x.risk)
    return {
        "risk": worst.risk,
        "label": worst.label,
        "ends": [
            {"city": x.city, "label": x.label, "tempC": x.tempC, "precipMm": x.precipMm, "risk": x.risk}
            for x in ends
        ],
    }


async def fetch_hubs_weather(hubs: list[dict[str, float]]) -> list[HubWeather]:
    """Batch fetch for dashboards — silently skips cities the API cannot reach."""
    results = await asyncio.gather(*(fetch_hub_weather(h["city"], h["lat"], h["lng"]) for h in hubs))
    return [r for r in results if r is not None]
