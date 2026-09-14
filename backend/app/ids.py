"""Tiny cuid-style ID generator.

The existing database was created by Prisma, whose `cuid()` produces strings
like `cmu02ixja0002nvfec1dy5f36`. The exact format is not load-bearing — any
unique TEXT primary key works — but we keep the same *shape* (lowercase,
starts with `c`, ~25 chars, time-ordered prefix) so rows created by the
Python backend are visually indistinguishable.
"""
from __future__ import annotations

import itertools
import os
import time

_B36 = "0123456789abcdefghijklmnopqrstuvwxyz"
_counter = itertools.count(int.from_bytes(os.urandom(2), "big"))


def _to_base36(n: int, width: int) -> str:
    if n == 0:
        return "0" * width
    digits: list[str] = []
    while n:
        n, rem = divmod(n, 36)
        digits.append(_B36[rem])
    return "".join(reversed(digits)).rjust(width, "0")


def new_id() -> str:
    """Generate a unique, time-ordered id (cuid-like)."""
    ts = _to_base36(int(time.time() * 1000), 8)
    rand = _to_base36(int.from_bytes(os.urandom(6), "big"), 9)
    return f"c{ts}{rand}{next(_counter) % 1296:02x}"
