"use client";

import * as React from "react";
import { CloudRain, CloudSun, RadioTower } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Real, live weather across showcase hubs — fetched client-side from our
 * public /api/live/conditions endpoint (Open-Meteo, cached 15 min).
 * Rendered in the landing hero as proof the platform runs on live data.
 */
export default function LiveTicker() {
  const [hubs, setHubs] = React.useState<{ city: string; tempC: number; label: string; precipMm: number }[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/live/conditions")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setHubs(d.hubs ?? []);
      })
      .catch(() => {
        if (alive) setHubs([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-card/80 px-4 py-3 backdrop-blur"
      aria-label="Live weather at freight hubs"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-2">
        <RadioTower className="h-3 w-3 text-success" />
        Live now
      </span>
      {hubs === null ? (
        [0, 1, 2, 3].map((i) => <span key={i} className="h-3 w-24 animate-pulse rounded bg-muted" />)
      ) : hubs.length === 0 ? (
        <span className="text-xs text-ink-2">Live conditions unavailable right now</span>
      ) : (
        hubs.map((w) => (
          <span key={w.city} className="flex items-center gap-1.5 text-xs">
            {w.precipMm > 0 ? <CloudRain className="h-3.5 w-3.5 text-ai" /> : <CloudSun className="h-3.5 w-3.5 text-ink-2" />}
            <span className="font-medium text-ink">{w.city}</span>
            <span className="numeric text-ink-2">{Math.round(w.tempC)}°C</span>
            <span className={cn("hidden text-[11px] text-ink-2 sm:inline")}>· {w.label}</span>
          </span>
        ))
      )}
      <a
        href="https://open-meteo.com"
        target="_blank"
        rel="noreferrer"
        className="ml-auto text-[10.5px] font-medium text-success underline-offset-2 hover:underline"
      >
        Open-Meteo · live
      </a>
    </div>
  );
}
