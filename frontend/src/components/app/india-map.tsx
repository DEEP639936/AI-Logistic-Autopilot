"use client";

import * as React from "react";
import type { OverviewDTO } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Stylized India corridor network — equirectangular projection of real hub
 * coordinates, layered national outline, animated demo-telemetry trucks and
 * LIVE weather markers (Open-Meteo) on wet hubs. No paid tiles, no map
 * library: pure SVG, honest and dependency-free.
 */

const LNG_MIN = 66.5, LNG_MAX = 98.5, LAT_MIN = 6.0, LAT_MAX = 37.8;
const W = 660, H = 620;

function project(lat: number, lng: number): [number, number] {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * H;
  return [x, y];
}

/* Low-poly national outline (lat, lng) — stylized, recognizably India. */
const OUTLINE: [number, number][] = [
  [35.8, 76.8], [34.8, 78.2], [32.8, 79.4], [30.9, 79.1], [28.9, 80.2], [27.4, 80.9],
  [26.6, 83.0], [25.7, 85.3], [26.4, 88.1], [27.9, 89.5], [26.9, 91.6], [27.3, 94.5],
  [26.0, 95.5], [24.5, 93.5], [22.0, 92.7], [23.4, 91.4], [22.9, 89.0], [21.6, 87.0],
  [20.1, 86.4], [17.7, 84.0], [15.9, 80.9], [14.4, 80.1], [13.1, 80.3], [11.9, 79.8],
  [10.8, 79.8], [9.3, 78.2], [8.1, 77.5], [9.9, 76.3], [11.2, 75.8], [12.9, 74.8],
  [15.4, 73.9], [17.7, 73.0], [19.0, 72.8], [21.1, 72.6], [22.3, 72.6], [22.9, 69.8],
  [23.9, 68.2], [24.6, 71.1], [25.7, 71.0], [27.0, 70.5], [28.0, 70.2], [29.0, 72.4],
  [29.9, 73.9], [31.0, 74.6], [32.3, 74.6], [33.8, 74.3], [34.7, 75.3],
];

/* Slightly shrunken copy used as an inner highlight layer. */
const INNER: [number, number][] = OUTLINE.map(([lat, lng]) => {
  const cLat = 22.6, cLng = 79.6;
  return [cLat + (lat - cLat) * 0.965, cLng + (lng - cLng) * 0.965] as [number, number];
});

function toPath(points: [number, number][]): string {
  return (
    points
      .map(([lat, lng], i) => {
        const [x, y] = project(lat, lng);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

const OUTLINE_PATH = toPath(OUTLINE);
const INNER_PATH = toPath(INNER);

const LABELED_HUBS = new Set(["Mumbai", "Delhi", "Kolkata", "Chennai", "Bengaluru", "Hyderabad", "Ahmedabad", "Nagpur", "Kochi", "Guwahati"]);

const BAND_COLOR: Record<string, string> = {
  low: "#0e8a5f",
  medium: "#c07a10",
  high: "#d4570e",
  critical: "#d0362a",
};

interface Truck {
  id: string;
  from: [number, number];
  to: [number, number];
  baseProgress: number;
  riskBand: string;
  ref: string;
  reg: string;
  t: number; // local animation clock
}

export function IndiaMap({
  map,
  liveWeather,
  className,
  onTruckClick,
}: {
  map: OverviewDTO["map"];
  liveWeather?: OverviewDTO["liveWeather"];
  className?: string;
  onTruckClick?: (shipmentId: string) => void;
}) {
  const [trucks, setTrucks] = React.useState<Truck[]>([]);
  const dataRef = React.useRef(map.live);

  /* Rebase trucks when fresh demo telemetry arrives, keep animation clock. */
  React.useEffect(() => {
    setTrucks((prev) => {
      const prevById = new Map(prev.map((t) => [t.id, t]));
      return dataRef.current === map.live
        ? prev
        : map.live.map((leg) => ({
            id: leg.id,
            from: leg.from,
            to: leg.to,
            baseProgress: leg.progress,
            riskBand: leg.riskBand,
            ref: leg.ref,
            reg: leg.vehicleReg,
            t: prevById.get(leg.id)?.t ?? Math.random() * 100,
          }));
    });
    dataRef.current = map.live;
  }, [map.live]);

  /* Animate along the corridor. */
  React.useEffect(() => {
    if (!trucks.length) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTrucks((ts) => ts.map((t) => ({ ...t, t: t.t + dt * 0.55 })));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [trucks.length]);

  const hubPts = map.hubs.map((h) => {
    const [px, py] = project(h.lat, h.lng);
    return { city: h.city, x: px, y: py };
  });

  const weatherByCity = new Map((liveWeather ?? []).map((w) => [w.city, w]));
  const wetHubCount = (liveWeather ?? []).filter((w) => w.risk >= 0.3).length;

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-line bg-[#f8f6f0] grid-blueprint", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Live corridor network map of India (demo telemetry, live weather)">
        <defs>
          <radialGradient id="landGrad" cx="50%" cy="40%" r="78%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
            <stop offset="62%" stopColor="#f6f2e9" stopOpacity="0.94" />
            <stop offset="100%" stopColor="#ece5d6" stopOpacity="0.92" />
          </radialGradient>
          <linearGradient id="coast" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4570e" stopOpacity="0.5" />
            <stop offset="55%" stopColor="#0e8ca3" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0e8a5f" stopOpacity="0.45" />
          </linearGradient>
          <filter id="truckGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* ambient landmass glow */}
        <path d={OUTLINE_PATH} fill="#0e8ca3" opacity="0.06" filter="url(#softGlow)" transform="translate(0 6)" />
        {/* landmass */}
        <path d={OUTLINE_PATH} fill="url(#landGrad)" stroke="url(#coast)" strokeWidth="2" strokeLinejoin="round" />
        {/* inner highlight */}
        <path d={INNER_PATH} fill="none" stroke="rgba(24,34,52,0.07)" strokeWidth="1" />

        {/* corridor routes for live legs */}
        {trucks.map((t) => {
          const [x1, y1] = projectFrom(t.from[0], t.from[1]);
          const [x2, y2] = projectFrom(t.to[0], t.to[1]);
          const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12;
          const my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
          const color = BAND_COLOR[t.riskBand] ?? "#0e8ca3";
          return (
            <g key={`route-${t.id}`}>
              <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke={color} strokeOpacity="0.14" strokeWidth="4.6" strokeLinecap="round" filter="url(#softGlow)" />
              <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke={color} strokeOpacity="0.2" strokeWidth="2.2" />
              <path
                d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                fill="none"
                stroke={color}
                strokeOpacity="0.6"
                strokeWidth="1.5"
                className="route-flow"
              />
            </g>
          );
        })}

        {/* vehicles parked at hubs (available) */}
        {map.vehicles
          .filter((v) => v.status === "available")
          .map((v) => {
            const [x, y] = projectFrom(v.lat, v.lng);
            return <circle key={v.id} cx={x} cy={y} r={2.6} fill="rgba(24,34,52,0.34)" />;
          })}

        {/* hubs (with live weather rings when wet) */}
        {hubPts.map((h) => {
          const w = weatherByCity.get(h.city);
          const wet = w ? w.risk >= 0.3 : false;
          const heavy = w ? w.risk >= 0.55 : false;
          return (
            <g key={h.city}>
              {wet && (
                <>
                  <circle cx={h.x} cy={h.y} r={heavy ? 11 : 8.5} fill="#0e8ca3" fillOpacity={heavy ? 0.18 : 0.12} className="pulse-ring" style={{ transformOrigin: `${h.x}px ${h.y}px` }} />
                  <circle cx={h.x} cy={h.y} r={heavy ? 7.5 : 6} fill="none" stroke="#0e8ca3" strokeOpacity="0.5" strokeWidth="1.1" strokeDasharray="2.5 3" />
                </>
              )}
              <circle cx={h.x} cy={h.y} r={LABELED_HUBS.has(h.city) ? 3.4 : 2.2} fill="#182234" fillOpacity={LABELED_HUBS.has(h.city) ? 0.85 : 0.45} />
              {LABELED_HUBS.has(h.city) && (
                <text x={h.x + 6} y={h.y + 3} fontSize="10.5" fill="rgba(24,34,52,0.62)" fontWeight="600" letterSpacing="0.02em">
                  {h.city}
                </text>
              )}
              {wet && w && LABELED_HUBS.has(h.city) && (
                <text x={h.x + 6} y={h.y + 14} fontSize="9" fill="#0e7c90" fontWeight="600">
                  {w.label} · {Math.round(w.tempC)}°C
                </text>
              )}
              <title>{w ? `${h.city} — live: ${w.label}, ${w.tempC}°C, ${w.precipMm}mm (Open-Meteo)` : h.city}</title>
            </g>
          );
        })}

        {/* disruptions */}
        {map.disruptions.map((d) => {
          const [x, y] = projectFrom(d.lat, d.lng);
          const color = BAND_COLOR[d.severity] ?? "#c07a10";
          return (
            <g key={d.id}>
              <circle cx={x} cy={y} r={5} fill={color} fillOpacity="0.14" className="pulse-ring" style={{ transformOrigin: `${x}px ${y}px` }} />
              <circle cx={x} cy={y} r={4.2} fill={color} stroke="#fff" strokeWidth="1.4" />
            </g>
          );
        })}

        {/* live trucks */}
        {trucks.map((t) => {
          const p = (Math.sin(t.t * 0.09 + t.baseProgress * 0.02) * 0.5 + 0.5) * 0.25 + Math.min(0.95, t.baseProgress / 100) * 0.72;
          const [x1, y1] = projectFrom(t.from[0], t.from[1]);
          const [x2, y2] = projectFrom(t.to[0], t.to[1]);
          const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12;
          const my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
          const pos = quadraticPoint(x1, y1, mx, my, x2, y2, Math.min(0.97, p));
          const color = BAND_COLOR[t.riskBand] ?? "#0e8ca3";
          return (
            <g
              key={t.id}
              className={onTruckClick ? "cursor-pointer" : undefined}
              onClick={() => onTruckClick?.(t.id)}
              role={onTruckClick ? "button" : undefined}
            >
              <circle cx={pos.x} cy={pos.y} r={7.5} fill={color} fillOpacity="0.16" filter="url(#truckGlow)" />
              <circle cx={pos.x} cy={pos.y} r={3.6} fill={color} stroke="#fff" strokeWidth="1.6" />
              <title>{`${t.ref} · ${t.reg} · ${t.riskBand} risk`}</title>
            </g>
          );
        })}
      </svg>

      {/* legend */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white/85 px-2.5 py-1.5 backdrop-blur">
        <span className="live-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-success" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-2">Demo telemetry</span>
        <span className="mx-1 h-3 w-px bg-line" />
        {(["low", "medium", "high", "critical"] as const).map((b) => (
          <span key={b} className="flex items-center gap-1 text-[10px] capitalize text-ink-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: BAND_COLOR[b] }} />
            {b}
          </span>
        ))}
        {wetHubCount > 0 && (
          <>
            <span className="mx-1 h-3 w-px bg-line" />
            <span className="flex items-center gap-1 text-[10px] font-semibold text-ai">
              <span className="h-1.5 w-1.5 rounded-full bg-ai pulse-ring inline-block" style={{ transformOrigin: "center" }} />
              live rain · Open-Meteo
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function projectFrom(lat: number, lng: number): [number, number] {
  return project(lat, lng);
}

function quadraticPoint(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number) {
  const u = 1 - t;
  return {
    x: u * u * x1 + 2 * u * t * cx + t * t * x2,
    y: u * u * y1 + 2 * u * t * cy + t * t * y2,
  };
}
