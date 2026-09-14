"use client";

/* Return-Load Matching — turn empty return trips into revenue (Task 6-b). */

import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedNumber, EmptyState, ErrorState, PanelSkeleton } from "@/components/primitives";
import { useAcceptReturnLoad, useReturnLoads } from "@/lib/api";
import type { ReturnLoadMatch } from "@/lib/api";
import { inr, km, tons } from "@/lib/format";
import { useUI } from "@/lib/store";
import { FactorBar, MetaBadges, PageHeader, SectionLabel } from "./view-kit";

/* ==================================================================== */

export default function ReturnLoadsView() {
  const q = useReturnLoads();
  const accept = useAcceptReturnLoad();
  const setTab = useUI((s) => s.setTab);

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  function acceptMatch(m: ReturnLoadMatch) {
    setBusyId(m.id);
    accept.mutate(m.id, {
      onSuccess: () => toast.success(`Load ${m.load.ref} assigned to ${m.vehicle.regNo}`),
      onError: (err) => toast.error(err.message),
      onSettled: () => setBusyId(null),
    });
  }

  function decline(m: ReturnLoadMatch) {
    setHidden((h) => new Set(h).add(m.id));
    toast("Match hidden this session");
  }

  const matches = (q.data?.matches ?? []).filter((m) => !hidden.has(m.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Return-Load Matching"
        subtitle="Turn empty return trips into revenue"
        right={<MetaBadges meta={q.data?.meta} />}
      />

      {q.isLoading ? (
        <PanelSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : matches.length === 0 ? (
        <EmptyState
          title="No matches above threshold"
          hint="Return matches must clear the minimum score, minimum profit and max detour km rules — widen them in thresholds to surface more loads."
          action={
            <Button variant="outline" size="sm" onClick={() => setTab("thresholds")}>
              Review thresholds
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {matches.map((m) => (
            <article key={m.id} className="rounded-xl border border-line bg-card p-4 sm:p-5">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="numeric text-sm font-semibold text-ink">{m.vehicle.regNo}</p>
                  <p className="truncate text-xs text-ink-2">
                    {m.vehicle.typeLabel} · {m.vehicle.currentCity}
                  </p>
                </div>
                <span className="numeric rounded-full bg-muted px-2 py-0.5 text-[10px] text-ink-2">
                  {m.load.ref}
                </span>
              </div>

              {/* Load route + info */}
              <div className="mt-2.5 flex items-center gap-2 text-sm font-medium text-ink">
                <span>{m.vehicle.currentCity}</span>
                <ArrowRight className="h-4 w-4 text-brand" aria-hidden="true" />
                <span>{m.load.destCity}</span>
              </div>
              <p className="mt-1 text-xs text-ink-2">
                {m.load.client} · {m.load.cargo} · <span className="numeric">{tons(m.load.weightKg)}</span> ·{" "}
                <span className="numeric">pays {inr(m.load.payInr)}</span>
              </p>

              {/* Economics */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                <span className="numeric text-ink-2">Detour {km(m.detourKm)}</span>
                <span className="numeric text-sm font-semibold text-success">
                  +{inr(m.profitInr)} est. profit
                </span>
              </div>

              {/* Score block */}
              <div className="mt-4 grid items-start gap-4 sm:grid-cols-[auto,1fr]">
                <div className="rounded-lg border border-ai/20 bg-ai-soft/60 px-4 py-3 text-center">
                  <SectionLabel>Match score</SectionLabel>
                  <AnimatedNumber value={m.score} className="mt-1 block text-3xl font-semibold text-ai" />
                </div>
                <div className="space-y-3">
                  {m.scoreBreakdown.map((f) => (
                    <FactorBar
                      key={f.factor}
                      label={f.factor}
                      contribution={f.contribution}
                      detail={f.detail}
                      tone="ai"
                    />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-3.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[36px]"
                  disabled={!!busyId}
                  onClick={() => decline(m)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" /> Decline
                </Button>
                <Button
                  size="sm"
                  className="min-h-[36px] bg-ink text-paper hover:bg-ink/90"
                  disabled={busyId === m.id}
                  onClick={() => acceptMatch(m)}
                >
                  {busyId === m.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Accept match
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
