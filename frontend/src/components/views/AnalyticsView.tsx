"use client";

/* Analytics — performance, cost and carbon trends (Task 6-b). */

import { useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Star } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, PanelSkeleton } from "@/components/primitives";
import { useAnalytics } from "@/lib/api";
import type { AnalyticsDTO } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/types";
import { dateShort, inr, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FadeUp, MetaBadges, PageHeader } from "./view-kit";

const AXIS_TICK = { fontSize: 11, fill: "var(--color-ink-2)" };

const TOOLTIP_PROPS = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--color-line)",
    borderRadius: 10,
    fontSize: 12,
    boxShadow: "0 10px 30px -12px rgba(24, 34, 52, 0.25)",
  },
  labelStyle: { color: "var(--color-ink-2)", fontSize: 11, marginBottom: 4 },
  itemStyle: { color: "var(--color-ink)" },
} as const;

const STATUS_TEXT: Record<string, string> = STATUS_LABELS;

const STATUS_CHIP_CLS: Record<string, string> = {
  draft: "text-ink-2 bg-muted",
  scheduled: "text-ai bg-ai-soft",
  assigned: "text-ai-strong bg-ai-soft",
  in_transit: "text-brand bg-brand-soft",
  delivered: "text-success bg-success-soft",
  cancelled: "text-ink-2 bg-muted",
  exception: "text-danger bg-danger-soft",
};

function statusText(s: string): string {
  return STATUS_TEXT[s] ?? s.replace(/_/g, " ");
}

function shortDate(d: string): string {
  return dateShort(d);
}

function ChartCard({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta: AnalyticsDTO["meta"];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-card p-5", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <MetaBadges meta={meta} />
      </div>
      {children}
    </div>
  );
}

/* ==================================================================== */

export default function AnalyticsView() {
  const [days, setDays] = useState(30);
  const q = useAnalytics(days);

  if (q.isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Analytics" subtitle="Performance, cost and carbon trends" />
        <PanelSkeleton rows={6} />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Analytics" subtitle="Performance, cost and carbon trends" />
        <ErrorState message={q.error?.message} onRetry={() => q.refetch()} />
      </div>
    );
  }

  const data = q.data;
  const meta = data.meta;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        subtitle="Performance, cost and carbon trends"
        right={
          <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <TabsList className="h-9">
              <TabsTrigger value="7" className="min-h-[36px] px-3">
                7d
              </TabsTrigger>
              <TabsTrigger value="30" className="min-h-[36px] px-3">
                30d
              </TabsTrigger>
              <TabsTrigger value="90" className="min-h-[36px] px-3">
                90d
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FadeUp index={0}>
          <ChartCard title="On-time performance" meta={meta}>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={data.onTimeSeries}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-line)" }}
                  minTickGap={24}
                />
                <YAxis
                  yAxisId="pct"
                  domain={[0, 100]}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis yAxisId="count" orientation="right" tick={AXIS_TICK} tickLine={false} axisLine={false} width={34} />
                <Tooltip {...TOOLTIP_PROPS} />
                <Bar
                  yAxisId="count"
                  dataKey="shipments"
                  name="Shipments"
                  fill="var(--color-muted)"
                  barSize={10}
                  radius={[3, 3, 0, 0]}
                />
                <Area
                  yAxisId="pct"
                  type="monotone"
                  dataKey="onTimePct"
                  name="On-time %"
                  stroke="var(--color-success)"
                  strokeWidth={2}
                  fill="var(--color-success)"
                  fillOpacity={0.18}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </FadeUp>

        <FadeUp index={1}>
          <ChartCard title="Cost per km" meta={meta}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.costSeries}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-line)" }}
                  minTickGap={24}
                />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v: number) => `₹${v}`}
                />
                <Tooltip {...TOOLTIP_PROPS} />
                <Line
                  type="monotone"
                  dataKey="costPerKm"
                  name="Cost per km"
                  stroke="var(--color-brand)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </FadeUp>

        <FadeUp index={2}>
          <ChartCard title="CO₂ per day (kg)" meta={meta}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.co2Series}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-line)" }}
                  minTickGap={24}
                />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
                <Tooltip {...TOOLTIP_PROPS} />
                <Bar dataKey="co2Kg" name="CO₂ kg" fill="var(--color-ai)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </FadeUp>

        <FadeUp index={3}>
          <ChartCard title="Fleet utilization %" meta={meta}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.utilizationSeries}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: "var(--color-line)" }}
                  minTickGap={24}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip {...TOOLTIP_PROPS} />
                <Line
                  type="monotone"
                  dataKey="utilizationPct"
                  name="Utilization %"
                  stroke="var(--color-ink)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </FadeUp>
      </div>

      {/* Corridors + drivers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FadeUp index={4}>
          <ChartCard title="Top corridors" meta={meta}>
            <div className="divide-y divide-line">
              {data.topCorridors.map((c) => (
                <div key={c.corridor} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{c.corridor}</p>
                  <span className="numeric rounded-full bg-muted px-2 py-0.5 text-[10px] text-ink-2">
                    {num(c.shipments)} shipments
                  </span>
                  <Progress
                    value={c.onTimePct}
                    aria-label={`On-time ${c.corridor}`}
                    className="h-1.5 w-24 bg-muted [&>div]:bg-success"
                  />
                  <span className="numeric w-16 text-right text-xs text-ink-2">{inr(c.avgCostInr)}/km</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </FadeUp>

        <FadeUp index={5}>
          <ChartCard title="Driver leaderboard" meta={meta}>
            <div className="divide-y divide-line">
              {data.driverLeaderboard.slice(0, 5).map((d, i) => (
                <div key={d.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      "numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      i === 0 ? "bg-brand text-paper" : "bg-muted text-ink-2"
                    )}
                  >
                    {i + 1}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{d.name}</p>
                  <span className="numeric text-xs text-ink-2">{num(d.trips)} trips</span>
                  <span className="numeric w-12 text-right text-xs text-ink">{d.onTimePct}%</span>
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-warn text-warn" aria-hidden="true" />
                    <span className="numeric text-xs text-ink-2">{d.rating.toFixed(1)}</span>
                  </span>
                </div>
              ))}
            </div>
          </ChartCard>
        </FadeUp>
      </div>

      {/* Status breakdown */}
      <FadeUp index={6}>
        <ChartCard title="Status breakdown" meta={meta}>
          {data.statusBreakdown.length === 0 ? (
            <EmptyState title="No shipments in range" hint="Adjust the date range to see status distribution." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.statusBreakdown.map((s) => (
                <span
                  key={s.status}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                    STATUS_CHIP_CLS[s.status] ?? "text-ink-2 bg-muted"
                  )}
                >
                  {statusText(s.status)}
                  <span className="numeric">{num(s.count)}</span>
                </span>
              ))}
            </div>
          )}
        </ChartCard>
      </FadeUp>
    </div>
  );
}
