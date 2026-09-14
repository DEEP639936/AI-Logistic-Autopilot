# AI Logistics Autopilot — Frontend

Next.js 16 App Router UI. Talks to the FastAPI backend through transparent `/api/*`
rewrites (see `next.config.ts`), so the browser only ever sees one origin.

```bash
npm install
npm run dev        # http://localhost:3000 (auto-spawns ../backend in dev)
npm run build && npm start
```

Env: `API_PROXY_URL` (default `http://127.0.0.1:8000`), `AUTO_START_PY_BACKEND` (`0`
disables auto-spawn), `PY_BACKEND_PORT` (default `8000`).

Surfaces: marketing landing, sign-in/sign-up, command center, shipments, fleet & drivers,
route intelligence, consolidation, return loads, disruption control, analytics, copilot,
AI thresholds — all in a light, off-white design system with honest data-status badges.
