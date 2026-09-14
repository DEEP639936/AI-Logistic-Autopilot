# AI Logistics Autopilot

An AI-powered freight **command center** for Indian road logistics — built for Smart India
Hackathon 2026. One screen where every consignment, truck and driver is live: plan routes with
real road data, score delay risk before SLA breach, auto-assign the best vehicle, consolidate
part-loads, fill empty return legs and walk through disruptions with click-through playbooks.

**Two services, one API.** A Next.js frontend (UI + transparent proxy) and a Python **FastAPI**
backend that owns every business rule — FastAPI is the only API in the system.

## Repository layout

```
ai-logistics-autopilot/
├── frontend/          Next.js 16 UI (port 3000) — proxies /api/* to the backend
├── backend/           FastAPI service (port 8000) — 31 REST endpoints, 7 AI engines
│   ├── app/           routers, engines, live-data clients, models, seed
│   └── config/        ai_logistics_thresholds.yaml (single source of AI truth)
├── docs/              PDF documentation + demo script
├── docker-compose.yml optional one-command orchestration
└── .github/           CI (backend + frontend)
```

## Quick start

Prerequisites: **Node 20+** (or Bun) and **Python 3.12+**.

```bash
# 1 · Backend (FastAPI, port 8000)
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
# → creates + seeds SQLite at backend/data/app.db on first boot
# → interactive API docs at http://localhost:8000/docs

# 2 · Frontend (Next.js, port 3000) — second terminal
cd frontend
npm install
npm run dev
# → http://localhost:3000 (dev auto-spawns the backend if it is not already running)
```

### Demo credentials (password for all: `Demo@12345`)

| Email | Role |
|---|---|
| `admin@meridian.in` | Org Admin — Meridian Freight Systems |
| `ops@meridian.in` | Operations Manager |
| `analyst@meridian.in` | Analyst (read-only enforcement) |
| `admin@kalinga.in` | Org Admin — Kalinga Carriers (org-isolation proof) |

Or click **Launch live demo** on the landing page for one-click auto-login.

## Stack at a glance

| | |
|---|---|
| **Frontend** | Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · TanStack Query · Recharts · Framer Motion |
| **Backend** | Python 3.12 · **FastAPI** · Pydantic v2 · SQLAlchemy 2 · Uvicorn · httpx |
| **Database** | SQLite (self-seeding, PostgreSQL-ready models) |
| **Live data** | Open-Meteo (weather) · BRouter/OSRM over OpenStreetMap (road routing) |
| **AI** | 7 deterministic, explainable engines + optional LLM copilot (any OpenAI-compatible endpoint, or the bundled z-ai bridge) |

Every AI output carries an honest label — `live`, `rule_based`, `optimization` or `demo` —
and the 45 scoring parameters behind the engines are editable at runtime (AI Thresholds screen,
versioned config).

## Environment variables

**backend/.env** (see `.env.example`): `DATABASE_PATH`, `LLM_BASE_URL` + `LLM_API_KEY` +
`LLM_MODEL` (optional copilot LLM), `THRESHOLDS_YAML`.
**frontend**: `API_PROXY_URL` (default `http://127.0.0.1:8000`), `AUTO_START_PY_BACKEND`
(`0` disables the dev auto-spawn), `PY_BACKEND_PORT`.

## Docker (optional)

```bash
docker compose up --build
# frontend on :3000, backend on :8000
```

## Documentation

Full documentation (architecture, pipeline, API reference, AI models, features in real-world
scenarios, data sources) is in [`docs/AI-Logistics-Autopilot-Documentation.pdf`](docs/) —
a compact 10-page edition. The judge walkthrough is in [`docs/DEMO_SCRIPT.md`](docs/).

## Live data & attribution

- **Open-Meteo** — current weather per hub (15-min cache, seasonal fallback, labelled estimate).
- **BRouter / OSRM (OpenStreetMap)** — real road distance & duration per corridor (24-h+ RoadLeg
  cache, straight-line estimate fallback). Data © OpenStreetMap contributors (ODbL).
- Fleet operations are a **labelled demo dataset**; weather and road figures are genuinely live.
