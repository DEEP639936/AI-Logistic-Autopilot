"use client";

/* Load Consolidation — combine compatible shipments into fuller trucks (Task 6-b). */

import { useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AnimatedNumber, EmptyState, ErrorState, PanelSkeleton } from "@/components/primitives";
import { useApplyConsolidation, useConsolidation } from "@/lib/api";
import type { ConsolidationGroup } from "@/lib/api";
import { inr, tons } from "@/lib/format";
import { FadeUp, MetaBadges, PageHeader, SectionLabel } from "./view-kit";

function FillBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-2">{label}</span>
        <span className="numeric font-medium text-ink">{v}%</span>
      </div>
      <Progress
        value={v}
        aria-label={label}
        className="mt-1.5 h-1.5 bg-muted [&>div]:bg-ai"
      />
    </div>
  );
}

/* ==================================================================== */

export default function ConsolidationView() {
  const q = useConsolidation();
  const apply = useApplyConsolidation();
  const [applyingId, setApplyingId] = useState<string | null>(null);

  function applyGroup(g: ConsolidationGroup) {
    setApplyingId(g.id);
    apply.mutate(g.shipments.map((s) => s.id), {
      onSuccess: (res) => toast.success(`Consolidated as ${res.ref} · saved ${inr(res.savingsInr)}`),
      onError: (err) => toast.error(err.message),
      onSettled: () => setApplyingId(null),
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Load Consolidation"
        subtitle="Combine compatible shipments into fuller trucks"
      />

      {/* Explanation strip */}
      <div className="flex flex-col gap-2 rounded-lg border border-ai/20 bg-ai-soft/60 p-3 text-xs leading-relaxed text-ink-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl">
          Groups are formed from scheduled shipments that share a corridor and a compatible departure
          window, capped by vehicle weight and volume capacity. Applying a group creates one fuller truck
          and its cost is shared across the loads.
        </p>
        <MetaBadges meta={q.data?.meta} />
      </div>

      {q.isLoading ? (
        <PanelSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : !q.data || q.data.groups.length === 0 ? (
        <EmptyState
          title="No consolidation candidates right now"
          hint="New scheduled shipments create opportunities automatically — groups appear here as soon as compatible loads share a corridor."
        />
      ) : (
        <div className="space-y-4">
          {q.data.groups.map((g, i) => (
            <FadeUp key={g.id} index={Math.min(i, 6)}>
              <article className="rounded-xl border border-line bg-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-lg text-ink">{g.corridor}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="numeric rounded-full bg-muted px-2 py-0.5 text-[10px] text-ink-2">
                      window {g.departureWindow}
                    </span>
                    <span className="numeric rounded-full bg-muted px-2 py-0.5 text-[10px] text-ink-2">
                      Threshold-driven
                    </span>
                  </div>
                </div>

                {/* Shipments mini-table */}
                <div className="mt-3 overflow-x-auto scrollbar-slim">
                  <table className="w-full min-w-[420px] text-xs">
                    <thead>
                      <tr className="border-b border-line">
                        {["Ref", "Client", "Destination", "Weight"].map((h) => (
                          <th key={h} className="overline-label py-1.5 pr-3 text-left text-[9px] text-ink-2">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.shipments.map((s) => (
                        <tr key={s.id} className="border-b border-line last:border-0">
                          <td className="numeric py-2 pr-3 font-medium text-ink">{s.ref}</td>
                          <td className="py-2 pr-3 text-ink">{s.client}</td>
                          <td className="py-2 pr-3 text-ink-2">{s.destCity}</td>
                          <td className="numeric py-2 pr-3 text-right text-ink">{tons(s.weightKg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Fill visualization */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <FillBar label={`Weight fill · ${tons(g.totalWeightKg)}`} value={g.fillWeightPct} />
                  <FillBar label="Volume fill" value={g.fillVolPct} />
                </div>

                {/* Savings + apply */}
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
                  <div>
                    <SectionLabel>Est. savings</SectionLabel>
                    <div className="mt-1 flex items-center gap-2">
                      <AnimatedNumber
                        value={g.savingsInr}
                        format={(n) => inr(n)}
                        className="font-display text-3xl text-success"
                      />
                      <span className="numeric rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                        {g.savingsPct}%
                      </span>
                    </div>
                  </div>
                  <Button
                    className="min-h-[40px] bg-ink text-paper hover:bg-ink/90"
                    disabled={applyingId === g.id}
                    onClick={() => applyGroup(g)}
                  >
                    {applyingId === g.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Layers className="h-4 w-4" aria-hidden="true" />
                    )}
                    Create consolidated load ({g.shipments.length})
                  </Button>
                </div>
              </article>
            </FadeUp>
          ))}
        </div>
      )}
    </div>
  );
}
