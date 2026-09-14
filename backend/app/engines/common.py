"""Shared engine helpers: JS-compatible rounding and en-IN number formatting."""
from __future__ import annotations

import math


def js_round(v: float) -> int:
    """JS Math.round — half rounds toward +Infinity (Python round() is banker's)."""
    return int(math.floor(v + 0.5))


def clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def round1(v: float) -> float:
    return js_round(v * 10) / 10


def to_fixed0(v: float) -> str:
    """JS Number.toFixed(0) equivalent for display strings."""
    return f"{v:.0f}"


def to_fixed(v: float, digits: int) -> str:
    return f"{v:.{digits}f}"


def format_en_in(n: int) -> str:
    """JS `Number.toLocaleString('en-IN')` — lakh/crore grouping (e.g. 1,23,456)."""
    neg = n < 0
    s = str(abs(int(n)))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups + [tail])
    return f"-{s}" if neg else s


def inr(v: float) -> str:
    """`₹` + rounded Indian-grouped amount (matches the engine's `inr` helper)."""
    return f"₹{format_en_in(js_round(v))}"
