"use client";

/* Fleet & Drivers — vehicles, drivers and predictive maintenance (Task 6-b). */

import { useState } from "react";
import { toast } from "sonner";
import {
  CircleCheck,
  Clock,
  Gauge,
  Loader2,
  MapPin,
  Route,
  Star,
  Truck,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AnimatedNumber,
  EmptyState,
  ErrorState,
  PanelSkeleton,
  SeverityBadge,
} from "@/components/primitives";
import { useFleet } from "@/lib/api";
import type { DriverDTO, VehicleDTO } from "@/lib/types";
import { km, num, tons } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FadeUp, KpiCard, MetaBadges, PageHeader } from "./view-kit";

const VEHICLE_STATUS_CLS: Record<VehicleDTO["status"], { label: string; cls: string }> = {
  available: { label: "Available", cls: "text-success bg-success-soft" },
  in_use: { label: "On road", cls: "text-ai bg-ai-soft" },
  maintenance: { label: "Maintenance", cls: "text-warn bg-warn-soft" },
};

const DRIVER_STATUS_CLS: Record<DriverDTO["status"], { label: string; cls: string }> = {
  available: { label: "Available", cls: "text-success bg-success-soft" },
  on_duty: { label: "On duty", cls: "text-ai bg-ai-soft" },
  off_duty: { label: "Off duty", cls: "text-ink-2 bg-muted" },
};

function healthTone(v: number): { bar: string; text: string } {
  if (v >= 70) return { bar: "[&>div]:bg-success", text: "text-success" };
  if (v >= 40) return { bar: "[&>div]:bg-warn", text: "text-warn" };
  return { bar: "[&>div]:bg-danger", text: "text-danger" };
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function StatusChip({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>
      {label}
    </span>
  );
}

/* ==================================================================== */

export default function FleetView() {
  const fleet = useFleet();
  const [servicing, setServicing] = useState<string | null>(null);

  function scheduleService(vehicleId: string) {
    setServicing(vehicleId);
    setTimeout(() => {
      toast.success("Service visit logged (demo workflow)");
      setServicing(null);
    }, 450);
  }

  if (fleet.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Fleet & Drivers" subtitle="Vehicles, drivers and predictive maintenance" />
        <PanelSkeleton rows={6} />
      </div>
    );
  }

  if (fleet.isError || !fleet.data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Fleet & Drivers" subtitle="Vehicles, drivers and predictive maintenance" />
        <ErrorState message={fleet.error?.message} onRetry={() => fleet.refetch()} />
      </div>
    );
  }

  const { vehicles, drivers, summary, maintenanceFlags, meta } = fleet.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fleet & Drivers"
        subtitle="Vehicles, drivers and predictive maintenance"
        right={<MetaBadges meta={meta} />}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <FadeUp index={0} className="h-full">
          <KpiCard label="Total vehicles" icon={Truck} sub="registered in your org" className="h-full">
            <AnimatedNumber value={vehicles.length} />
          </KpiCard>
        </FadeUp>
        <FadeUp index={1} className="h-full">
          <KpiCard label="Available now" icon={CircleCheck} sub="ready to assign" className="h-full">
            <AnimatedNumber value={summary.available} />
          </KpiCard>
        </FadeUp>
        <FadeUp index={2} className="h-full">
          <KpiCard label="On road" icon={Route} sub="active consignments" className="h-full">
            <AnimatedNumber value={summary.inUse} />
          </KpiCard>
        </FadeUp>
        <FadeUp index={3} className="h-full">
          <KpiCard label="Fleet utilization" icon={Gauge} sub="share of fleet on road" className="h-full">
            <AnimatedNumber value={summary.utilizationPct} format={(n) => `${Math.round(n)}%`} />
          </KpiCard>
        </FadeUp>
      </div>

      <Tabs defaultValue="vehicles">
        <div className="max-w-full overflow-x-auto scrollbar-slim">
          <TabsList className="h-9">
            <TabsTrigger value="vehicles" className="min-h-[36px] px-3">
              Vehicles <span className="numeric text-xs text-ink-2">{vehicles.length}</span>
            </TabsTrigger>
            <TabsTrigger value="drivers" className="min-h-[36px] px-3">
              Drivers <span className="numeric text-xs text-ink-2">{drivers.length}</span>
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="min-h-[36px] px-3">
              Maintenance <span className="numeric text-xs text-ink-2">{maintenanceFlags.length}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Vehicles */}
        <FleetTabPanel value="vehicles">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {vehicles.map((v) => {
              const tone = healthTone(v.healthScore);
              const st = VEHICLE_STATUS_CLS[v.status];
              return (
                <div key={v.id} className="card-lift rounded-xl border border-line bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="numeric truncate text-sm font-semibold text-ink">{v.regNo}</p>
                      <p className="truncate text-xs text-ink-2">{v.typeLabel}</p>
                    </div>
                    <StatusChip label={st.label} cls={st.cls} />
                  </div>
                  <p className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-2">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {v.currentCity}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
                    <div>
                      <p className="overline-label text-[9px] text-ink-2">Capacity</p>
                      <p className="numeric mt-0.5 text-ink">{tons(v.capacityKg)}</p>
                    </div>
                    <div>
                      <p className="overline-label text-[9px] text-ink-2">Odometer</p>
                      <p className="numeric mt-0.5 text-ink">{km(v.odometerKm)}</p>
                    </div>
                    <div>
                      <p className="overline-label text-[9px] text-ink-2">Fuel</p>
                      <p className="numeric mt-0.5 text-ink">{v.fuelEffKmpl} km/l</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-2">Health</span>
                      <span className={cn("numeric font-semibold", tone.text)}>{v.healthScore}</span>
                    </div>
                    <Progress
                      value={v.healthScore}
                      aria-label={`${v.regNo} health score`}
                      className={cn("mt-1.5 h-1.5 bg-muted", tone.bar)}
                    />
                  </div>
                  {v.currentShipmentRef ? (
                    <p className="numeric mt-3 inline-flex rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand">
                      {v.currentShipmentRef}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </FleetTabPanel>

        {/* Drivers */}
        <FleetTabPanel value="drivers">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {drivers.map((d) => {
              const st = DRIVER_STATUS_CLS[d.status];
              const longHours = d.hoursToday >= 9;
              return (
                <div key={d.id} className="card-lift rounded-xl border border-line bg-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper">
                      {initials(d.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{d.name}</p>
                      <p className="numeric truncate text-xs text-ink-2">{d.phone}</p>
                    </div>
                    <StatusChip label={st.label} cls={st.cls} />
                  </div>
                  <p className="numeric mt-2 text-[11px] text-ink-2">Licence {d.licenseNo}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-xs">
                    <span className="flex items-center gap-1.5" title="Hours driven today">
                      <Clock className="h-3.5 w-3.5 text-ink-2" aria-hidden="true" />
                      <span className={cn("numeric font-medium", longHours ? "text-warn" : "text-ink-2")}>
                        {d.hoursToday}h today
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 fill-warn text-warn" aria-hidden="true" />
                      <span className="numeric text-ink-2">{d.rating.toFixed(1)}</span>
                    </span>
                    <span className="numeric text-ink-2">
                      {num(d.trips)} trips · {d.onTimePct}% on-time
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </FleetTabPanel>

        {/* Maintenance */}
        <FleetTabPanel value="maintenance">
          {maintenanceFlags.length === 0 ? (
            <EmptyState
              title="No maintenance flags — fleet healthy"
              hint="Predictive maintenance watches health scores, odometer deltas and service intervals."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {maintenanceFlags.map((f) => (
                <div key={f.vehicleId} className="rounded-xl border border-line bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="numeric text-sm font-semibold text-ink">{f.regNo}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink">{f.issue}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">{f.detail}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 min-h-[36px] gap-1.5"
                    disabled={servicing === f.vehicleId}
                    onClick={() => scheduleService(f.vehicleId)}
                  >
                    {servicing === f.vehicleId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Schedule service
                  </Button>
                </div>
              ))}
            </div>
          )}
        </FleetTabPanel>
      </Tabs>
    </div>
  );
}

/* ---------------- Tab panel wrapper (scrollable lists) ---------------- */

function FleetTabPanel({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsContent value={value} className="mt-4">
      <div className="max-h-[520px] overflow-y-auto scrollbar-slim pr-1">{children}</div>
    </TabsContent>
  );
}
