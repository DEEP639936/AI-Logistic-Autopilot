"""JSON serialization parity with the original TypeScript API.

JavaScript's JSON.stringify renders whole floats without a trailing `.0`
(`18` not `18.0`). Every response from this service is rendered through
`NormalizedJSONResponse` so payloads stay byte-compatible with the frontend
contracts (which were typed against the Next.js implementation).
"""
from __future__ import annotations

import json

from fastapi.responses import JSONResponse


def _numify(obj: object) -> object:
    """Recursively convert whole floats to ints (JS JSON semantics)."""
    if isinstance(obj, float):
        return int(obj) if obj.is_integer() else obj
    if isinstance(obj, dict):
        return {k: _numify(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_numify(v) for v in obj]
    return obj


class NormalizedJSONResponse(JSONResponse):
    """JSONResponse that renders whole floats as ints."""

    def render(self, content: object) -> bytes:
        return json.dumps(
            _numify(content),
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
