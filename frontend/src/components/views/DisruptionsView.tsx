"use client";

/* Disruption Control — live incidents and automated playbooks (Task 6-b). */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Check, CheckCircle2, Loader2, Play, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DataStatusBadge,
  EmptyState,
  ErrorState,
  PanelSkeleton,
  SeverityBadge,
} from "@/components/primitives";
import { useDisruptionAction, useDisruptions } from "@/lib/api";
import type { DisruptionDTO } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FadeUp, PageHeader, SectionLabel } from "./view-kit";

const SEVERITY_RANK: Record<DisruptionDTO["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_SPINE: Record<DisruptionDTO["severity"], string> = {
  critical: "border-l-danger",
  high: "border-l-brand",
  medium: "border-l-warn",
  low: "border-l-success",
};

const INCIDENT_STATUS_CLS: Record<DisruptionDTO["status"], string> = {
  open: "text-danger bg-danger-soft",
  monitoring: "text-warn bg-warn-soft",
  resolved: "text-success bg-success-soft",
};

type DisruptionAction = "run_playbook" | "resolve" | "escalate";

/* ==================================================================== */

export default function DisruptionsView() {
  const q = useDisruptions();
  const action = useDisruptionAction();
  const [acting, setActing] = useState<string | null>(null);

  const incidents = useMemo(() => {
    const list = q.data?.incidents ?? [];
    return [...list].sort((a, b) => {
      const ra = a.status === "resolved" ? 1 : 0;
      const rb = b.status === "resolved" ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    });
  }, [q.data]);

  function run(d: DisruptionDTO, act: DisruptionAction) {
    setActing(`${d.id}:${act}`);
    action.mutate(
      { id: d.id, action: act },
      {
        onSuccess: (res) => {
          if (act === "run_playbook") {
            toast.success(
              res.affected.length
                ? `Re-routed: ${res.affected.join(", ")}`
                : "Playbook step executed — no shipments affected"
            );
          } else if (act === "resolve") {
            toast.success(`${res.incident.title} marked resolved`);
          } else {
            toast.success(`${res.incident.title} escalated to the control desk`);
          }
        },
        onError: (err) => toast.error(err.message),
        onSettled: () => setActing(null),
      }
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Disruption Control"
        subtitle="Live incidents and automated playbooks"
        right={q.data ? <DataStatusBadge status={q.data.meta.dataStatus} /> : null}
      />

      {q.isLoading ? (
        <PanelSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : incidents.length === 0 ? (
        <EmptyState
          title="No active disruptions"
          hint="Corridors are clear — incidents appear here the moment telemetry or rules detect them."
        />
      ) : (
        <div className="space-y-4">
          {incidents.map((d, i) => {
            const resolved = d.status === "resolved";
            const busy = acting === `${d.id}:run_playbook`;
            const busyEsc = acting === `${d.id}:escalate`;
            const busyRes = acting === `${d.id}:resolve`;
            return (
              <FadeUp key={d.id} index={Math.min(i, 6)}>
                <article
                  className={cn(
                    "rounded-xl border border-line border-l-4 bg-card p-4 sm:p-5",
                    SEVERITY_SPINE[d.severity],
                    resolved && "opacity-75"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">{d.title}</h3>
                      <SeverityBadge severity={d.severity} />
                      <span className="numeric rounded-full bg-muted px-2 py-0.5 text-[10px] text-ink-2">
                        {d.corridor}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                          INCIDENT_STATUS_CLS[d.status]
                        )}
                      >
                        {d.status}
                      </span>
                      <span className="numeric text-xs text-ink-2">{timeAgo(d.createdAt)}</span>
                    </div>
                  </div>

                  <p className="mt-2.5 text-sm leading-relaxed text-ink-2">{d.note}</p>

                  <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink-2">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="numeric">{d.affectedCount}</span> shipments affected
                  </p>

                  <div className="mt-4">
                    <SectionLabel>Playbook</SectionLabel>
                    <ol className="mt-2 space-y-1.5">
                      {d.steps.map((step, idx) => {
                        const done = idx < d.stepIndex || resolved;
                        const current = idx === d.stepIndex && !resolved;
                        return (
                          <li
                            key={`${d.id}-${idx}`}
                            className={cn(
                              "flex items-start gap-2.5 rounded-lg border px-3 py-2",
                              current ? "border-brand bg-brand-soft" : "border-transparent"
                            )}
                          >
                            {done ? (
                              <CheckCircle2
                                className="mt-0.5 h-4 w-4 shrink-0 text-success"
                                aria-hidden="true"
                              />
                            ) : (
                              <span
                                className={cn(
                                  "numeric mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                                  current ? "bg-brand text-paper" : "bg-muted text-ink-2"
                                )}
                              >
                                {idx + 1}
                              </span>
                            )}
                            <span
                              className={cn(
                                "text-xs leading-relaxed",
                                current ? "font-medium text-ink" : "text-ink-2"
                              )}
                            >
                              {step}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>

                  {!resolved && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3.5">
                      <Button
                        size="sm"
                        className="min-h-[36px] bg-ink text-paper hover:bg-ink/90"
                        disabled={!!acting}
                        onClick={() => run(d, "run_playbook")}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Run next step
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-[36px]"
                        disabled={!!acting}
                        onClick={() => run(d, "escalate")}
                      >
                        {busyEsc ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Escalate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[36px] border-success/40 text-success hover:bg-success-soft hover:text-success"
                        disabled={!!acting}
                        onClick={() => run(d, "resolve")}
                      >
                        {busyRes ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Mark resolved
                      </Button>
                    </div>
                  )}
                </article>
              </FadeUp>
            );
          })}
        </div>
      )}
    </div>
  );
}
