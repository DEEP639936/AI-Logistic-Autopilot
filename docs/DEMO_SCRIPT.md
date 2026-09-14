# Judge Demo Script — AI Logistics Autopilot (5 minutes)

Open the app preview (single route `/`). Everything below is verified working.

**Demo credentials** (password for all: `Demo@12345`)

| Email | Role | What to show with it |
|---|---|---|
| `admin@meridian.in` | Org Admin (Priya Sharma) | Everything, incl. thresholds editing |
| `ops@meridian.in` | Ops Manager (Arjun Mehta) | Everything, incl. thresholds editing |
| `dispatcher@meridian.in` | Dispatcher (Kavya Reddy) | Assign / advance / playbooks |
| `fleet@meridian.in` | Fleet Manager (Rohit Patil) | Fleet + maintenance |
| `analyst@meridian.in` | Analyst (Neha Gupta) | Read-only enforcement (mutations → 403) |
| `admin@kalinga.in` | Org Admin, 2nd org | Org isolation proof (sees only 8 shipments) |

---

## 0:00–0:30 — Landing site
- Hero: "India's freight, on *autopilot*." with the live-looking (clearly labelled **Demo data**) command-center preview card.
- **"Live now" ticker**: real weather across Mumbai / Delhi / Bengaluru / Kolkata from Open-Meteo — proof the platform runs on real external data, not just demo rows.
- Click **Launch live demo** → auto-signs-in as the Meridian Org Admin.

## 0:30–1:15 — Command Center
- KPI strip: Active / On-time 30d / At-risk / Utilization / Cost-per-km / CO₂ today.
- **Live Conditions strip**: real-time weather at the hubs this operation touches (Open-Meteo) — rain here feeds the risk engines.
- **Network map**: real Indian hub coordinates, animated trucks on corridors, live rain rings on wet hubs, pulsing disruption zones.
- **Delay radar**: click a row → shipment drawer opens with timeline + risk factor bars.
- **AI recommendation queue**: open **Why?** on a card → human-readable reasons + impact chips → **Approve** → toast + audit notification (bell badge increments).

## 1:15–2:00 — Shipments & AI assignment
- Shipments → table with status tabs, search, pagination (160 shipments).
- Filter **Scheduled** → open one → drawer shows **AI suggestions** with score breakdowns → **Assign** → status flips to Assigned, event logged, vehicle reserved.
- Back in the drawer → **Advance status** (state machine enforces legal transitions).

## 2:00–2:40 — Route Intelligence
- Route Intelligence → defaults Mumbai → Delhi → **Optimize route**.
- **Live source chips**: "Real road data · BRouter (OpenStreetMap) — LIVE" and "Live weather · Open-Meteo — LIVE" with current conditions.
- 3 alternatives (Fastest / Balanced / Economy) with **real road km & OSRM durations**, ETA, cost, tolls, fuel, CO₂ and a **score breakdown** whose weights come from your threshold config — the Weather factor quotes today's live conditions.

## 2:40–3:20 — Disruption playbook
- Disruption Control → **Monsoon flooding on Mumbai–Pune** (critical).
- **Run next step** → playbook advances, toast lists the real affected shipments (re-ETA'd), incident log updates.
- **Escalate** bumps severity; **Mark resolved** closes with a log entry.

## 3:20–3:50 — Consolidation + Return loads
- Consolidation → Bengaluru → Chennai group (fill bars) → **Create consolidated load** → toast shows the new ref + savings.
- Return Loads → match card with detour, score breakdown, est. profit → **Accept match**.

## 3:50–4:20 — Thresholds change propagates live
- AI Thresholds → **Delay Risk Bands → Medium Min**: 30 → 45 → **Save**.
- Toast: "Saved as config vN · hash". Back to Command Center → **At-risk KPI drops** and radar badges re-band instantly. All engines now run the new weights.

## 4:20–5:00 — Trust & depth (pick any)
- **Copilot** (sparkle FAB): "Which shipments should I worry about today?" → answers from your org's data, labelled *LLM + your data*, with source chips.
- **Analytics**: on-time / cost-per-km / CO₂ / utilization trends, corridors, driver leaderboard.
- **Org isolation**: profile menu → Sign out → Launch demo again after logging in as `admin@kalinga.in` — only 8 shipments, 3 vehicles, zero Meridian data.
- **RBAC**: sign in as `analyst@meridian.in` → try assigning → "Your role is read-only".
- **Command palette**: ⌘K / Ctrl+K anywhere.

## Honest-labelling cheat sheet
| Label | Meaning |
|---|---|
| `Demo data` | Seeded, clearly-labelled dataset (no live GPS/traffic in this environment) |
| `Rule-based AI` | Transparent, explainable heuristics — reasons ship with every score |
| `Optimizer` | Route/assignment optimization output |
| `LLM + your data` | Copilot answered using an LLM grounded on your org snapshot (falls back to a deterministic responder, labelled, if the provider is unavailable) |
