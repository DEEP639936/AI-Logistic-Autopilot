"use client";

/**
 * view-kit — small shared building blocks for the in-app views (Task 6-b).
 * Owned by the app-views agent; not intended for use outside src/components/views.
 */

import * as React from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataStatusBadge } from "@/components/primitives";
import type { Meta, ShipmentStatus } from "@/lib/types";
import { STATUS_LABELS, STATUS_MACHINE } from "@/lib/types";

/* ---------------- Page header ---------------- */

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-2xl text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </header>
  );
}

/* ---------------- Config / meta chips ---------------- */

export function ConfigChip({ version, className }: { version: string; className?: string }) {
  return (
    <span
      className={cn(
        "numeric inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-ink-2",
        className
      )}
    >
      cfg {version}
    </span>
  );
}

export function MetaBadges({ meta, className }: { meta?: Meta; className?: string }) {
  if (!meta) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <DataStatusBadge status={meta.dataStatus} />
      <ConfigChip version={meta.configVersion} />
    </span>
  );
}

/* ---------------- Stagger fade-up wrapper ---------------- */

export function FadeUp({
  children,
  index = 0,
  className,
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-24px" }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.06, 0.36), ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ---------------- Contribution bar (risk & score factors) ---------------- */

const BAR_TONES = {
  ai: "bg-ai",
  brand: "bg-brand",
  success: "bg-success",
  warn: "bg-warn",
  danger: "bg-danger",
} as const;

export type BarTone = keyof typeof BAR_TONES;

export function FactorBar({
  label,
  contribution,
  detail,
  tone = "ai",
}: {
  label: string;
  contribution: number;
  detail?: string;
  tone?: BarTone;
}) {
  const raw = contribution <= 1 ? contribution * 100 : contribution;
  const width = Math.max(2, Math.min(100, Math.round(raw)));
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink">{label}</span>
        <span className="numeric text-xs text-ink-2">{width}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", BAR_TONES[tone])} style={{ width: `${width}%` }} />
      </div>
      {detail ? <p className="mt-1 text-xs leading-relaxed text-ink-2">{detail}</p> : null}
    </div>
  );
}

/* ---------------- Score row (vehicle suggestions etc.) ---------------- */

export function ScoreRow({
  left,
  score,
  detail,
  action,
}: {
  left: React.ReactNode;
  score: number;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        {left}
        <span className="numeric inline-flex shrink-0 items-center rounded-full bg-ai-soft px-2 py-0.5 text-xs font-semibold text-ai">
          score {score}
        </span>
      </div>
      {detail ? <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{detail}</p> : null}
      {action ? <div className="mt-2.5 flex justify-end">{action}</div> : null}
    </div>
  );
}

/* ---------------- KPI card ---------------- */

export function KpiCard({
  label,
  icon: Icon,
  sub,
  children,
  className,
}: {
  label: string;
  icon: LucideIcon;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="overline-label text-ink-2">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
      </div>
      <div className="font-display mt-2 text-2xl text-ink">{children}</div>
      {sub ? <p className="mt-1 text-xs text-ink-2">{sub}</p> : null}
    </div>
  );
}

/* ---------------- Tiny section label ---------------- */

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("overline-label text-ink-2", className)}>{children}</p>;
}

/* ---------------- Status machine helpers ---------------- */

export function nextStatusOf(status: ShipmentStatus): ShipmentStatus | null {
  return STATUS_MACHINE[status][0] ?? null;
}

export function statusLabel(status: ShipmentStatus): string {
  return STATUS_LABELS[status] ?? status;
}
