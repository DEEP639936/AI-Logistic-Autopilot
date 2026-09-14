"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, GitCompareArrows, Sparkles, Wand2, MapPin, CloudRain, RadioTower } from "lucide-react";
import { useOptimize, useShipments, type RouteAlternative, type OptimizeResponse } from "@/lib/api";
import { PageHeader } from "@/components/views/view-kit";
import { DataStatusBadge, EmptyState, PanelSkeleton } from "@/components/primitives";
import { FactorBar } from "@/components/views/view-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { HUBS } from "@/lib/hubs";
import { formatEta } from "@/lib/format";
import { inr, km, num } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function RoutesView() {
  const [originCity, setOrigin] = React.useState("Mumbai");
  const [destCity, setDest] = React.useState("Delhi");
  const [weightKg, setWeight] = React.useState("12000");
  const [cargoType, setCargo] = React.useState("FMCG pallets");
  const [shipmentId, setShipmentId] = React.useState<string>("none");

  const optimize = useOptimize();
  const { data: scheduled } = useShipments({ status: "scheduled", pageSize: 50 });

  const run = () => {
    const w = Number(weightKg);
    if (!Number.isFinite(w) || w < 100 || w > 40000) {
      toast.error("Weight must be between 100 and 40,000 kg");
      return;
    }
    if (originCity === destCity) {
      toast.error("Origin and destination must differ");
      return;
    }
    optimize.mutate({ shipmentId: shipmentId === "none" ? undefined : shipmentId, originCity, destCity, weightKg: w, cargoType });
  };

  const result = optimize.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Route Intelligence"
        subtitle="Compare ranked corridor alternatives — cost, speed, risk and carbon, all explained"
        right={<DataStatusBadge status="optimization" />}
      />

      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        {/* Planner form */}
        <section className="h-fit rounded-2xl border border-line bg-card p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Wand2 className="h-4 w-4 text-brand" /> Route planner
          </h2>
          <p className="mt-1 text-xs text-ink-2">Deterministic engine · weights from your threshold config</p>

          <div className="mt-4 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="origin" className="text-xs">Origin</Label>
                <Select value={originCity} onValueChange={setOrigin}>
                  <SelectTrigger id="origin" size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {HUBS.map((h) => <SelectItem key={h.city} value={h.city}>{h.city}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dest" className="text-xs">Destination</Label>
                <Select value={destCity} onValueChange={setDest}>
                  <SelectTrigger id="dest" size="sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {HUBS.map((h) => <SelectItem key={h.city} value={h.city}>{h.city}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="weight" className="text-xs">Weight (kg)</Label>
                <Input id="weight" type="number" min={100} max={40000} value={weightKg} onChange={(e) => setWeight(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cargo" className="text-xs">Cargo type</Label>
                <Input id="cargo" value={cargoType} onChange={(e) => setCargo(e.target.value)} placeholder="e.g. FMCG pallets" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="forShipment" className="text-xs">Attach to scheduled shipment <span className="text-ink-2">(optional)</span></Label>
              <Select value={shipmentId} onValueChange={setShipmentId}>
                <SelectTrigger id="forShipment" size="sm"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="none">Standalone planning</SelectItem>
                  {scheduled?.items.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.ref} · {s.originCity}→{s.destCity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={run} disabled={optimize.isPending} className="w-full gap-2 bg-ink text-paper hover:bg-brand">
              {optimize.isPending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-paper/30 border-t-paper" /> : <Sparkles className="h-4 w-4" />}
              {optimize.isPending ? "Scoring corridors…" : "Optimize route"}
            </Button>
          </div>

          <div className="mt-4 rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed text-ink-2">
            Distances and transit times come from the <span className="font-medium text-ink">live road network</span> (OSRM · OpenStreetMap) and
            current weather from <span className="font-medium text-ink">Open-Meteo</span> — with graceful fallback to the deterministic model.
            The engine prices fuel (diesel ₹95/L demo rate), tolls (₹1.9/km × corridor density), driver &amp; wear, and CO₂
            (factor from your carbon config), then ranks with your <span className="font-mono">route_scoring_weights</span>.
          </div>
        </section>

        {/* Results */}
        <section>
          {optimize.isPending && <PanelSkeleton rows={5} />}
          {!optimize.isPending && !result && (
            <EmptyState
              title="No alternatives yet"
              hint="Pick a corridor and run the optimizer — you'll get 2–4 ranked routes with per-factor explanations."
              action={<Button size="sm" variant="outline" onClick={run} className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Try Mumbai → Delhi</Button>}
            />
          )}
          {!optimize.isPending && result && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink">
                  {result.alternatives.length} alternatives · recommended:{" "}
                  <span className="text-brand">{result.alternatives[result.recommendedIndex]?.label}</span>
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-ink-2">cfg {result.meta.configVersion}</span>
                {result.shipment && (
                  <span className="rounded-full bg-ai-soft px-2 py-0.5 text-[10.5px] font-medium text-ai">
                    for {result.shipment.ref}
                  </span>
                )}
              </div>
              {/* Live data sources actually used by this run */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {result.sources.map((s) => (
                  <a
                    key={s.name}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    title={s.detail}
                    className={cn(
                      "group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                      s.status === "live"
                        ? "border-success/30 bg-success-soft text-success hover:border-success/60"
                        : "border-line bg-muted text-ink-2",
                    )}
                  >
                    {s.status === "live" ? (
                      <span className="live-dot h-1.5 w-1.5 rounded-full bg-success" />
                    ) : (
                      <RadioTower className="h-3 w-3" />
                    )}
                    {s.name}
                    <span className="text-[10px] opacity-70">{s.status === "live" ? "LIVE" : "fallback"}</span>
                  </a>
                ))}
                {result.live.weather && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-ai/25 bg-ai-soft px-2.5 py-1 text-[11px] font-medium text-ai">
                    <CloudRain className="h-3 w-3" />
                    {result.live.weather.label}
                    {result.live.weather.ends.length > 0 && (
                      <span className="numeric opacity-80">
                        {result.live.weather.ends[0].tempC}°C · {result.live.weather.ends[0].precipMm}mm
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {result.alternatives.map((alt, i) => (
                  <AltCard key={alt.id} alt={alt} index={i} recommended={i === result.recommendedIndex} liveWeather={result.live.weather} />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function AltCard({
  alt,
  index,
  recommended,
  liveWeather,
}: {
  alt: RouteAlternative;
  index: number;
  recommended: boolean;
  liveWeather: OptimizeResponse["live"]["weather"];
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative flex flex-col rounded-2xl border bg-card p-4 shadow-sm",
        recommended ? "border-brand/50 shadow-[0_10px_36px_-14px_rgba(212,87,14,0.35)]" : "border-line",
      )}
    >
      {recommended && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Recommended
        </span>
      )}
      <header className="mb-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg text-ink">{alt.label}</h3>
          {alt.roadLive && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-success">
              <span className="live-dot h-1 w-1 rounded-full bg-success" /> OSRM
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-2">{alt.summary}</p>
      </header>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-surface-2 p-2.5 text-[11.5px]">
        <Metric label="ETA" value={formatEta(alt.etaMin)} />
        <Metric label="Distance" value={km(alt.distanceKm)} />
        <Metric label="Total cost" value={inr(alt.costInr)} strong />
        <Metric label="Tolls" value={inr(alt.tollsInr)} />
        <Metric label="Fuel" value={inr(alt.fuelInr)} />
        <Metric label="CO₂" value={`${num(alt.co2Kg)} kg`} />
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <MapPin className={cn("h-3.5 w-3.5", alt.riskBand === "low" ? "text-success" : alt.riskBand === "medium" ? "text-warn" : "text-brand")} />
        <span className="text-[11px] font-medium capitalize text-ink-2">{alt.riskBand} corridor risk</span>
        {liveWeather && liveWeather.risk >= 0.35 && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-ai-soft px-1.5 py-0.5 text-[10px] font-medium text-ai">
            <CloudRain className="h-2.5 w-2.5" /> {liveWeather.label}
          </span>
        )}
        <span className="numeric ml-auto text-[11px] text-ink-2">{alt.riskScore}/100</span>
      </div>

      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <p className="overline-label text-ink-2">Score breakdown</p>
        {alt.factors.map((f) => (
          <FactorBar key={f.factor} label={f.factor} contribution={f.contribution} detail={f.detail} tone="ai" />
        ))}
      </div>

      <div className="mt-3 space-y-1 border-t border-line pt-3">
        {alt.segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[11px] text-ink-2">
            <ArrowRight className="h-3 w-3 shrink-0 text-brand" />
            <span className="font-medium text-ink">{s.label}</span>
            <span className="font-mono text-[10px]">{s.road}</span>
            <span className="numeric ml-auto">{s.km} km</span>
          </div>
        ))}
      </div>
    </motion.article>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-2">{label}</span>
      <span className={cn("numeric", strong ? "font-semibold text-ink" : "text-ink")}>{value}</span>
    </div>
  );
}
