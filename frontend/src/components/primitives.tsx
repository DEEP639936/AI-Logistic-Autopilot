"use client";

import * as React from "react";
import { animate, useInView } from "framer-motion";
import { cn } from "@/lib/utils";
import type { DataStatus, RiskBand, ShipmentStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { AlertTriangle, RefreshCw, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ---------------- Data-status labelling contract ---------------- */

const DATA_STATUS_META: Record<DataStatus, { label: string; dot: string; cls: string; tip: string }> = {
  live: { label: "Live", dot: "bg-success", cls: "text-success bg-success-soft", tip: "Computed from data in your organization right now" },
  demo: { label: "Demo data", dot: "bg-ai", cls: "text-ai bg-ai-soft", tip: "Clearly-labelled demo dataset (no live telemetry in this environment)" },
  mock: { label: "Mock", dot: "bg-ink-2", cls: "text-ink-2 bg-muted", tip: "Mock payload for development" },
  rule_based: { label: "Rule-based AI", dot: "bg-ai", cls: "text-ai bg-ai-soft", tip: "Transparent, explainable rules + heuristics — no black box" },
  optimization: { label: "Optimizer", dot: "bg-brand", cls: "text-brand bg-brand-soft", tip: "Produced by the route/assignment optimization engine" },
  planned: { label: "Planned", dot: "bg-ink-2/50", cls: "text-ink-2 bg-muted", tip: "On the roadmap — not active in this build" },
};

export function DataStatusBadge({ status, className }: { status: DataStatus; className?: string }) {
  const m = DATA_STATUS_META[status] ?? DATA_STATUS_META.mock;
  return (
    <span
      title={m.tip}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        m.cls,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

/* ---------------- Risk & status badges ---------------- */

const RISK_META: Record<RiskBand, { cls: string; label: string }> = {
  low: { cls: "text-success bg-success-soft", label: "On track" },
  medium: { cls: "text-warn bg-warn-soft", label: "Watch" },
  high: { cls: "text-brand bg-brand-soft", label: "At risk" },
  critical: { cls: "text-danger bg-danger-soft", label: "Critical" },
};

export function RiskBadge({ band, score, className }: { band: RiskBand; score?: number; className?: string }) {
  const m = RISK_META[band] ?? RISK_META.low;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", m.cls, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", band !== "low" && "live-dot")} />
      {m.label}
      {score !== undefined && <span className="numeric opacity-70">{score}</span>}
    </span>
  );
}

const STATUS_CLS: Record<ShipmentStatus, string> = {
  draft: "text-ink-2 bg-muted",
  scheduled: "text-ai bg-ai-soft",
  assigned: "text-ai-strong bg-ai-soft",
  in_transit: "text-brand bg-brand-soft",
  delivered: "text-success bg-success-soft",
  cancelled: "text-ink-2 bg-muted",
  exception: "text-danger bg-danger-soft",
};

export function StatusBadge({ status, className }: { status: ShipmentStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", STATUS_CLS[status] ?? STATUS_CLS.draft, className)}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const SEVERITY_CLS: Record<string, string> = {
  low: "text-success bg-success-soft",
  medium: "text-warn bg-warn-soft",
  high: "text-brand bg-brand-soft",
  critical: "text-danger bg-danger-soft",
};

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", SEVERITY_CLS[severity] ?? SEVERITY_CLS.medium, className)}>
      <AlertTriangle className="h-3 w-3" />
      {severity}
    </span>
  );
}

/* ---------------- Animated counter ---------------- */

export function AnimatedNumber({
  value,
  format,
  className,
  duration = 1.2,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  duration?: number;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = React.useState(0);
  React.useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value, duration]);
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString("en-IN"));
  return (
    <span ref={ref} className={cn("numeric", className)}>
      {fmt(display)}
    </span>
  );
}

/* ---------------- Sparkline ---------------- */

export function Sparkline({ data, className, stroke = "var(--color-brand)" }: { data: number[]; className?: string; stroke?: string }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${28 - ((v - min) / range) * 24 - 2}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={cn("h-7 w-full", className)} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- Empty / error / loading states ---------------- */

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface-2 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-5 w-5 text-ink-2" />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {hint && <p className="mt-1 max-w-sm text-xs text-ink-2">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-danger/20 bg-danger-soft/50 px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft">
        <AlertTriangle className="h-5 w-5 text-danger" />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">Couldn&apos;t load this view</p>
        <p className="mt-1 text-xs text-ink-2">{message ?? "Check your connection and try again."}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

export function PanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="shimmer h-12 rounded-lg" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

/* ---------------- Section heading ---------------- */

export function SectionHead({
  overline,
  title,
  sub,
  className,
  align = "left",
}: {
  overline?: string;
  title: React.ReactNode;
  sub?: string;
  className?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {overline && <p className="overline-label text-brand">{overline}</p>}
      <h2 className="font-display mt-3 text-3xl leading-[1.08] text-ink sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{sub}</p>}
    </div>
  );
}
