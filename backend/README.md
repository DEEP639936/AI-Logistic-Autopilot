# AI Logistics Autopilot — FastAPI Backend

Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2 · SQLite (self-seeding).

```bash
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```

- **31 REST endpoints** under `/api/*` — interactive docs at `/docs`
- Creates and seeds the database on first boot (`app/seed.py`, deterministic)
- Auth: scrypt password hashing + opaque session cookies; roles ADMIN / OPS_MANAGER /
  DISPATCHER / ANALYST; every query is org-scoped
- 7 AI engines in `app/engines/` (delay risk, assignment, route scoring, consolidation,
  return-load matching, maintenance, rates) — all weights governed by
  `config/ai_logistics_thresholds.yaml`, editable at runtime from the UI
- Live data in `app/live/`: Open-Meteo weather + BRouter/OSRM road routing with caches
  and labelled fallbacks
- Optional copilot LLM via `LLM_BASE_URL`/`LLM_API_KEY` (or the bundled z-ai CLI bridge);
  falls back to the deterministic engine and says so

Re-seed from scratch: delete `data/app.db` (or your `DATABASE_PATH` file) and restart.
