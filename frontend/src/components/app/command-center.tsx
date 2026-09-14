"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Activity, AlertTriangle, Boxes, CheckCircle2, CloudRain, CloudSun, Droplets, Fuel, Gauge, Leaf, Route, ShieldAlert, Truck, XCircle, Clock3,
} from "lucide-react";
import {
  useOverview, useDecideRecommendation, type OverviewDTO,
} from "@/lib/api";
import type { RecommendationDTO } from "@/lib/types";
import { AnimatedNumber, DataStatusBadge, RiskBadge, EmptyState, PanelSkeleton, ErrorState } from "@/components/primitives";
import { IndiaMap } from "@/components/app/india-map";
import { inr, num, pct, timeAgo, timeOnly } from "@/lib/format";
import { useUI } from "@/lib/store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function CommandCenter() {
  const { data, isLoading, isError, refetch } = useOverview();
  const openShipment = useUI((s) => s.openShipment);

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <PanelSkeleton rows={6} />;

  const k = data.kpis;
  const wetHubs = data.liveWeather.filter((w) => w.risk >= 0.3).length;
  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Boxes} tint="text-ink" label="Active" value={k.activeShipments} sub={`${data.map.live.length} rolling now`} />
        <Kpi icon={Clock3} tint="text-success" label="On-time 30d" value={k.onTimePct} format={(v) => pct(v)} sub="vs promised ETA" />
        <Kpi icon={ShieldAlert} tint="text-brand" label="At risk" value={k.atRisk} sub="medium band or worse" pulse={k.atRisk > 0} />
        <Kpi icon={Gauge} tint="text-ai" label="Utilization" value={k.fleetUtilizationPct} format={(v) => pct(v)} sub={`${data.fleetStatus.inUse} of ${data.fleetStatus.available + data.fleetStatus.inUse + data.fleetStatus.maintenance} on road`} />
        <Kpi icon={Fuel} tint="text-warn" label="Cost / km" value={k.costPerKmInr} format={(v) => inr(v)} sub="30-day blended" />
        <Kpi icon={Leaf} tint="text-success" label="CO₂ today" value={k.co2TodayKg} format={(v) => `${num(v)} kg`} sub="in-transit tailpipe" />
      </div>

      {/* Live conditions — real weather from Open-Meteo for the hubs we run through */}
      {data.liveWeather.length > 0 && <LiveConditions hubs={data.liveWeather} attribution={data.liveSources[0]?.name ?? "Open-Meteo"} wetCount={wetHubs} />}

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Map */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="xl:col-span-2"
        >
          <div className="rounded-2xl border border-line bg-card p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
              <div>
                <h2 className="text-sm font-semibold text-ink">Network</h2>
                <p className="text-xs text-ink-2">Live legs, hubs and disruption zones</p>
              </div>
              <DataStatusBadge status={data.meta.dataStatus} />
            </div>
            <IndiaMap map={data.map} liveWeather={data.liveWeather} className="h-[380px] lg:h-[460px]" onTruckClick={(id) => openShipment(id)} />
          </div>
        </motion.section>

        {/* Right rail: risk feed + fleet */}
        <div className="space-y-5">
          <Panel title="Delay radar" icon={AlertTriangle} count={data.riskFeed.length}>
            {data.riskFeed.length === 0 ? (
              <EmptyState title="No active risks" hint="Nothing above the watch band right now." />
            ) : (
              <ul className="space-y-2">
                {data.riskFeed.map((r, i) => (
                  <motion.li
                    key={r.shipmentId}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <button
                      onClick={() => openShipment(r.shipmentId)}
                      className="group flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left transition hover:border-line hover:bg-surface-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-ink">
                          {r.ref} <span className="font-normal text-ink-2">· {r.route}</span>
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-2">
                          due {timeOnly(r.etaAt)} · {r.slackMin < 0 ? `${Math.abs(Math.round(r.slackMin / 60))}h behind` : `${Math.round(r.slackMin / 60)}h ahead`}
                          {r.weather && r.weather.risk >= 0.35 && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-ai-soft px-1.5 py-0.5 text-[9.5px] font-medium text-ai">
                              <Droplets className="h-2.5 w-2.5" /> {r.weather.label}
                            </span>
                          )}
                        </p>
                      </div>
                      <RiskBadge band={r.riskBand as "low" | "medium" | "high" | "critical"} score={r.riskScore} />
                    </button>
                  </motion.li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Fleet status" icon={Truck}>
            <div className="space-y-2.5">
              {[
                { label: "Available", value: data.fleetStatus.available, cls: "bg-success" },
                { label: "On road", value: data.fleetStatus.inUse, cls: "bg-ai" },
                { label: "Workshop", value: data.fleetStatus.maintenance, cls: "bg-warn" },
              ].map((row) => {
                const total = Math.max(1, data.fleetStatus.available + data.fleetStatus.inUse + data.fleetStatus.maintenance);
                return (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-ink">{row.label}</span>
                      <span className="numeric text-ink-2">{row.value} vehicles</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className={cn("h-full rounded-full", row.cls)}
                        initial={{ width: 0 }}
                        animate={{ width: `${(row.value / total) * 100}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-[11px] text-ink-2">
                Utilization target and maintenance rules come from your threshold config.
              </p>
            </div>
          </Panel>
        </div>
      </div>

      {/* Recommendations + activity */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RecommendationQueue recs={data.recommendations} configVersion={data.meta.configVersion} />
        </div>
        <Panel title="Activity" icon={Activity} scroll>
          <ol className="relative space-y-4 pl-4">
            <span className="absolute left-[5px] top-1 h-[calc(100%-8px)] w-px bg-line" aria-hidden />
            {data.activity.map((e, i) => (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="relative"
              >
                <span className="absolute -left-4 top-1 h-[9px] w-[9px] rounded-full border-2 border-card bg-ai" aria-hidden />
                <p className="text-xs leading-snug text-ink">{e.note}</p>
                <p className="mt-0.5 text-[10.5px] text-ink-2">
                  <span className="font-mono">{e.ref}</span> · {e.type} · {timeAgo(e.at)}
                </p>
              </motion.li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- Live conditions strip (Open-Meteo) ---------------- */

function LiveConditions({
  hubs,
  attribution,
  wetCount,
}: {
  hubs: OverviewDTO["liveWeather"];
  attribution: string;
  wetCount: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-line bg-card p-3 shadow-sm"
      aria-label="Live weather at operating hubs"
    >
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-2">Live conditions</h2>
        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">{attribution}</span>
        {wetCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-ai">
            <CloudRain className="h-3 w-3" /> {wetCount} hub{wetCount > 1 ? "s" : ""} with rain — risk engines are using live weather
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {hubs.map((w, i) => {
          const wet = w.risk >= 0.55;
          const damp = w.risk >= 0.3 && w.risk < 0.55;
          const Icon = wet || damp ? CloudRain : CloudSun;
          return (
            <motion.div
              key={w.city}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.035 }}
              className={cn(
                "rounded-xl border p-2.5",
                wet ? "border-ai/30 bg-ai-soft" : "border-line bg-surface-2",
              )}
              title={`${w.city}: ${w.label}, ${w.tempC}°C, ${w.precipMm}mm now, ${w.precipTodayMm}mm forecast today`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[11px] font-semibold text-ink">{w.city}</span>
                <Icon className={cn("h-3.5 w-3.5 shrink-0", wet || damp ? "text-ai" : "text-ink-2")} />
              </div>
              <p className="numeric mt-1 text-sm font-semibold text-ink">{w.tempC}°C</p>
              <p className="truncate text-[10px] text-ink-2" >{w.label}</p>
              <p className="numeric text-[10px] text-ink-2">{w.precipMm > 0 ? `${w.precipMm} mm now` : `today ${w.precipTodayMm} mm`}</p>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}

function Kpi({
  icon: Icon, label, value, format, sub, tint, pulse,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  format?: (v: number) => string;
  sub: string;
  tint: string;
  pulse?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-lift rounded-xl border border-line bg-card p-3.5"
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", tint)} />
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-ink-2">{label}</span>
        {pulse && <span className="live-dot ml-auto h-1.5 w-1.5 rounded-full bg-brand" />}
      </div>
      <p className="mt-1.5 text-xl font-semibold text-ink">
        <AnimatedNumber value={value} format={format} />
      </p>
      <p className="mt-0.5 truncate text-[11px] text-ink-2">{sub}</p>
    </motion.div>
  );
}

export function Panel({
  title, icon: Icon, children, count, scroll,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  count?: number;
  scroll?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-line bg-card p-4 shadow-sm"
    >
      <header className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {count !== undefined && <span className="numeric rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-ink-2">{count}</span>}
      </header>
      <div className={cn(scroll && "max-h-[320px] overflow-y-auto pr-1 scrollbar-slim")}>{children}</div>
    </motion.section>
  );
}

/* ---------------- AI recommendation queue ---------------- */

function RecommendationQueue({ recs, configVersion }: { recs: RecommendationDTO[]; configVersion: string }) {
  const decide = useDecideRecommendation();

  return (
    <Panel title="AI recommendation queue" icon={Route} count={recs.length}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DataStatusBadge status="rule_based" />
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-ink-2">cfg {configVersion}</span>
        <span className="text-[11px] text-ink-2">Every action is audit-logged · confidence gates from thresholds</span>
      </div>
      {recs.length === 0 ? (
        <EmptyState title="Queue clear" hint="New recommendations appear as the engines spot opportunities." />
      ) : (
        <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1 scrollbar-slim">
          {recs.map((r, i) => (
            <RecCard key={r.id} rec={r} index={i} onDecide={(action) => decide.mutate({ id: r.id, action })} pending={decide.isPending} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function RecCard({
  rec, index, onDecide, pending,
}: {
  rec: RecommendationDTO;
  index: number;
  onDecide: (action: "approve" | "reject") => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const confidencePct = Math.round(rec.confidence * 100);
  const ring = confidencePct >= 85 ? "text-success" : confidencePct >= 65 ? "text-ai" : "text-warn";

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-xl border border-line bg-surface-2 p-3.5"
    >
      <div className="flex items-start gap-3">
        <div className="relative mt-0.5 h-11 w-11 shrink-0">
          <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-muted)" strokeWidth="3.5" />
            <circle
              cx="18" cy="18" r="15.5" fill="none" className={ring} stroke="currentColor" strokeWidth="3.5"
              strokeLinecap="round" strokeDasharray={`${(confidencePct / 100) * 97.4} 97.4`}
            />
          </svg>
          <span className={cn("numeric absolute inset-0 flex items-center justify-center text-[11px] font-semibold", ring)}>
            {confidencePct}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-ai-soft px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-wide text-ai">{rec.type.replace(/_/g, " ")}</span>
            <h3 className="text-[13px] font-semibold text-ink">{rec.title}</h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{rec.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {rec.impact.cost_inr ? <ImpactChip label="saves" value={inr(rec.impact.cost_inr)} tone="success" /> : null}
            {rec.impact.time_min ? <ImpactChip label="eta" value={`${rec.impact.time_min > 0 ? "+" : ""}${Math.abs(rec.impact.time_min)}m`} tone={rec.impact.time_min > 0 ? "warn" : "success"} /> : null}
            {rec.impact.co2_kg ? <ImpactChip label="co₂" value={`${num(rec.impact.co2_kg)} kg`} tone="ai" /> : null}
            {rec.impact.risk_delta ? <ImpactChip label="risk" value={`${rec.impact.risk_delta > 0 ? "+" : ""}${rec.impact.risk_delta}`} tone={rec.impact.risk_delta > 0 ? "warn" : "success"} /> : null}
            <button onClick={() => setOpen(!open)} className="ml-1 text-[11px] font-medium text-ai underline-offset-2 hover:underline">
              {open ? "Hide reasoning" : "Why?"}
            </button>
          </div>
          {open && (
            <div className="mt-2 space-y-1.5 rounded-lg bg-card p-2.5">
              <p className="overline-label text-ink-2">Reasoning</p>
              <ul className="space-y-1">
                {rec.reasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-ink-2">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <Button size="sm" className="h-7 gap-1 bg-ink px-2.5 text-[11px] text-paper hover:bg-brand" disabled={pending} onClick={() => { onDecide("approve"); toast.success("Approved · execution queued (demo workflow)"); }}>
            <CheckCircle2 className="h-3 w-3" /> Approve
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2.5 text-[11px] text-ink-2" disabled={pending} onClick={() => { onDecide("reject"); toast("Rejected · feedback recorded"); }}>
            <XCircle className="h-3 w-3" /> Reject
          </Button>
        </div>
      </div>
    </motion.article>
  );
}

function ImpactChip({ label, value, tone }: { label: string; value: string; tone: "success" | "warn" | "ai" }) {
  const cls = tone === "success" ? "bg-success-soft text-success" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-ai-soft text-ai";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", cls)}>
      {label} <span className="numeric">{value}</span>
    </span>
  );
}
