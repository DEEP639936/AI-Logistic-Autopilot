"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Info, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { useThresholds, usePutThresholds, useResetThresholds } from "@/lib/api";
import { PageHeader } from "@/components/views/view-kit";
import { PanelSkeleton, ErrorState } from "@/components/primitives";
import { useMe } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Schema = NonNullable<ReturnType<typeof useThresholds>["data"]>;
type Section = Schema["schema"][number];

export default function ThresholdsView() {
  const { data, isLoading, isError, refetch } = useThresholds();
  const { data: me } = useMe();
  const put = usePutThresholds();
  const reset = useResetThresholds();

  const [draft, setDraft] = React.useState<Record<string, Record<string, number>> | null>(null);

  React.useEffect(() => {
    if (data && draft === null) setDraft(JSON.parse(JSON.stringify(data.config)));
  }, [data, draft]);

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data || !draft) return <PanelSkeleton rows={8} />;

  const canEdit = me?.user ? ["ORG_ADMIN", "OPS_MANAGER"].includes(me.user.role) : false;

  const diff = countDiff(data.config, draft);
  const setField = (section: string, key: string, value: number) =>
    setDraft((d) => (d ? { ...d, [section]: { ...d[section], [key]: value } } : d));

  const save = () => {
    put.mutate(draft, {
      onSuccess: (res) => toast.success(`Saved as config v${res.version} · ${res.configHash}`),
      onError: (e) => toast.error(e.message),
    });
  };

  const resetAll = () => {
    reset.mutate(undefined, {
      onSuccess: () => {
        setDraft(null);
        toast.success("Thresholds restored to template defaults");
      },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="AI & Operational Thresholds"
        subtitle="The single source of truth behind every score, band and alert — changes propagate to all AI outputs live"
        right={
          <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10.5px] text-ink-2">
            v{data.meta.version} · {data.meta.configHash} · updated {timeAgo(data.meta.updatedAt)}
          </span>
        }
      />

      {!canEdit && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn-soft/60 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p className="text-xs leading-relaxed text-ink">
            <span className="font-semibold">Read-only view.</span> Your role ({me?.user?.role.replace("_", " ")}) can inspect thresholds but only an
            Org Admin or Ops Manager can change them. The current config is what every engine on this platform is using right now.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.schema.map((section, si) => (
          <SectionCard
            key={section.key}
            section={section}
            index={si}
            draft={draft}
            canEdit={canEdit}
            onChange={setField}
          />
        ))}
      </div>

      {/* Sticky action bar */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur md:left-[var(--sb-w,248px)]"
      >
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <p className="text-xs text-ink-2">
            {diff > 0 ? (
              <>
                <span className="font-semibold text-brand">{diff} change{diff > 1 ? "s" : ""}</span> pending — engines switch over the moment you save.
              </>
            ) : (
              "No local changes. Editing here re-scores routes, risks and recommendations org-wide."
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={resetAll} disabled={!canEdit || reset.isPending}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset to template
            </Button>
            <Button size="sm" className="gap-1.5 bg-ink text-paper hover:bg-brand" onClick={save} disabled={!canEdit || diff === 0 || put.isPending}>
              {put.isPending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-paper/30 border-t-paper" /> : <Save className="h-3.5 w-3.5" />}
              Save {diff > 0 ? `(${diff})` : ""}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SectionCard({
  section, index, draft, canEdit, onChange,
}: {
  section: Section;
  index: number;
  draft: Record<string, Record<string, number>>;
  canEdit: boolean;
  onChange: (section: string, key: string, value: number) => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-2xl border border-line bg-card p-5 shadow-sm"
    >
      <header className="mb-4 flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-ink">{section.label}</h2>
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide text-ink-2">{section.key}</span>
      </header>
      <div className="space-y-4">
        {section.fields.map((f) => {
          const value = draft[section.key]?.[f.key] ?? f.value;
          const changed = value !== f.value;
          const isWeight = section.key.endsWith("_weights");
          return (
            <div key={f.key}>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={`${section.key}.${f.key}`} className="text-xs font-medium text-ink">
                  {f.label}
                  {changed && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle" aria-label="modified" />}
                </label>
                <div className="flex items-center gap-1">
                  <Input
                    id={`${section.key}.${f.key}`}
                    type="number"
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    value={value}
                    disabled={!canEdit}
                    onChange={(e) => onChange(section.key, f.key, Number(e.target.value))}
                    className="h-7 w-24 border-line bg-surface-2 text-right font-mono text-xs"
                  />
                  <span className="w-12 text-[10px] text-ink-2">{f.unit === "boolean" ? (value ? "on" : "off") : f.unit}</span>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={value}
                  disabled={!canEdit}
                  onChange={(e) => onChange(section.key, f.key, Number(e.target.value))}
                  aria-label={`${f.label} slider`}
                  className="h-1 flex-1 cursor-pointer accent-[#d4570e] disabled:cursor-not-allowed"
                />
                <button
                  onClick={() => onChange(section.key, f.key, f.defaultValue)}
                  disabled={!canEdit || !changed}
                  className="text-[10px] text-ink-2 underline-offset-2 transition hover:text-brand hover:underline disabled:opacity-0"
                  title={`Template default: ${f.defaultValue}`}
                >
                  reset
                </button>
              </div>
              <p className={cn("mt-1 text-[10.5px] leading-snug text-ink-2", isWeight && "italic")}>{f.description}</p>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

function countDiff(base: Record<string, Record<string, number>>, draft: Record<string, Record<string, number>>): number {
  let n = 0;
  for (const [section, params] of Object.entries(draft)) {
    for (const [key, v] of Object.entries(params)) {
      if (base[section]?.[key] !== v) n++;
    }
  }
  return n;
}
