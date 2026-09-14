"""Environment configuration (12-factor style).

All knobs come from environment variables with sane defaults so the service
runs out of the box inside the monorepo. Nothing here reads secrets from the
thresholds YAML — config values are business rules, secrets live in env.
"""
from __future__ import annotations

import os
from pathlib import Path


# ---------------------------------------------------------------------------
# .env loader (zero-dependency; a backend/.env file overrides the defaults)
# ---------------------------------------------------------------------------
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip())

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
# Default: data/app.db next to this package — created and seeded on first boot.
# Override with DATABASE_PATH (backend/.env or environment) to share a file.
_DATABASE_ENV = os.environ.get("DATABASE_PATH", "")
if _DATABASE_ENV:
    DATABASE_PATH: str = _DATABASE_ENV
else:
    _data_dir = Path(__file__).resolve().parent.parent / "data"
    _data_dir.mkdir(parents=True, exist_ok=True)
    DATABASE_PATH = str(_data_dir / "app.db")

# ---------------------------------------------------------------------------
# Thresholds YAML (business-rule template)
# ---------------------------------------------------------------------------
_THRESHER_ENV = os.environ.get("THRESHOLDS_YAML", "")
if _THRESHER_ENV:
    THRESHOLDS_YAML: str = _THRESHER_ENV
else:
    # Prefer the packaged copy (self-contained service), fall back to the
    # monorepo root config used by the Next.js implementation.
    _packaged = Path(__file__).resolve().parent.parent / "config" / "ai_logistics_thresholds.yaml"
    THRESHOLDS_YAML = str(_packaged)

# ---------------------------------------------------------------------------
# LLM provider (optional — copilot degrades to the deterministic engine)
# ---------------------------------------------------------------------------
LLM_BASE_URL: str = os.environ.get("LLM_BASE_URL", "").rstrip("/")
LLM_API_KEY: str = os.environ.get("LLM_API_KEY", "")
LLM_MODEL: str = os.environ.get("LLM_MODEL", "gpt-4o-mini")

LLM_TIMEOUT_S: float = float(os.environ.get("LLM_TIMEOUT_S", "25"))

# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------
SESSION_TTL_MS: int = 7 * 24 * 3600 * 1000  # 7 days, mirrors src/lib/auth.ts
