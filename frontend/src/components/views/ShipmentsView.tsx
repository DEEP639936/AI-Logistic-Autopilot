"use client";

/* Shipments — plan, assign and track every consignment (Task 6-b). */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Loader2,
  MapPin,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DataStatusBadge,
  EmptyState,
  ErrorState,
  PanelSkeleton,
  RiskBadge,
  StatusBadge,
} from "@/components/primitives";
import {
  useAdvanceShipment,
  useAssignShipment,
  useCreateShipment,
  useShipments,
  useShipment,
  useSuggestions,
} from "@/lib/api";
import type { ShipmentDTO, ShipmentStatus } from "@/lib/types";
import { HUBS } from "@/lib/hubs";
import { useUI } from "@/lib/store";
import { dateShort, dateTime, etaHours, inr, km, timeAgo, tons } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  FactorBar,
  MetaBadges,
  PageHeader,
  ScoreRow,
  SectionLabel,
  nextStatusOf,
  statusLabel,
} from "./view-kit";

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "assigned", label: "Assigned" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "exception", label: "Exception" },
];

const PAGE_SIZE = 12;

/* ==================================================================== */

export default function ShipmentsView() {
  const [filter, setFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = useShipments({
    status: filter === "all" ? undefined : filter,
    q: q || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shipments"
        subtitle="Plan, assign and track every consignment"
        right={
          <Button className="bg-ink text-paper hover:bg-ink/90" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New shipment
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-full overflow-x-auto scrollbar-slim">
          <Tabs
            value={filter}
            onValueChange={(v) => {
              setFilter(v);
              setPage(1);
            }}
          >
            <TabsList className="h-9">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.value} value={f.value} className="min-h-[36px] px-3">
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2"
              aria-hidden="true"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search ref, client, route…"
              aria-label="Search shipments"
              className="h-9 pl-8"
            />
          </div>
          <p className="numeric whitespace-nowrap text-xs text-ink-2">
            {list.isLoading ? "…" : `${list.data?.total ?? 0} shipments`}
          </p>
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-line bg-card">
        {list.isLoading ? (
          <PanelSkeleton rows={8} className="p-4" />
        ) : list.isError ? (
          <div className="p-6">
            <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
          </div>
        ) : !list.data || list.data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No shipments match"
              hint="Try a different status tab or clear the search to see the full consignment list."
              action={
                (filter !== "all" || q) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFilter("all");
                      setSearchInput("");
                    }}
                  >
                    Clear filters
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {["Ref", "Client", "Route", "Vehicle / Driver", "Weight", "ETA", "Risk", "Status", "Progress"].map(
                  (h) => (
                    <TableHead key={h} className="overline-label text-[10px] text-ink-2">
                      {h}
                    </TableHead>
                  )
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.items.map((s, i) => (
                <motion.tr
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: Math.min(i * 0.03, 0.3) }}
                  tabIndex={0}
                  aria-label={`Open shipment ${s.ref}`}
                  onClick={() => useUI.getState().openShipment(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      useUI.getState().openShipment(s.id);
                    }
                  }}
                  className="cursor-pointer border-b border-line outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
                >
                  <TableCell className="numeric font-semibold text-ink">{s.ref}</TableCell>
                  <TableCell className="text-sm text-ink">{s.client}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                      {s.originCity}
                      <ArrowRight className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                      {s.destCity}
                    </span>
                  </TableCell>
                  <TableCell>
                    {s.vehicleReg ? (
                      <>
                        <p className="numeric text-sm text-ink">{s.vehicleReg}</p>
                        <p className="text-[11px] text-ink-2">{s.driverName ?? "—"}</p>
                      </>
                    ) : (
                      <span className="text-sm text-ink-2">—</span>
                    )}
                  </TableCell>
                  <TableCell className="numeric text-sm text-ink">{tons(s.weightKg)}</TableCell>
                  <TableCell>
                    <p className="numeric text-sm font-medium text-ink">{etaHours(s.etaAt)}</p>
                    <p className="numeric text-[11px] text-ink-2">{dateShort(s.etaAt)}</p>
                  </TableCell>
                  <TableCell>
                    <RiskBadge band={s.riskBand} score={s.riskScore} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell>
                    <Progress
                      value={s.progress}
                      aria-label={`${s.ref} progress`}
                      className="h-1.5 w-[72px] bg-muted [&>div]:bg-brand"
                    />
                    <p className="numeric mt-1 text-[10px] text-ink-2">{s.progress}%</p>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination footer */}
        {list.data && list.data.items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3">
            <p className="numeric text-xs text-ink-2">
              Page {list.data.page} of {pages} · {list.data.total} total
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[36px]"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[36px]"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <CreateShipmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

/* ==================================================================== */

const EMPTY_FORM = {
  client: "",
  cargo: "",
  weightKg: "",
  volumeM3: "",
  originCity: "",
  destCity: "",
  priority: "standard",
  plannedDeparture: "",
};

type FormState = typeof EMPTY_FORM;

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-ink-2">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function CreateShipmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateShipment();

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  function validate(f: FormState): Record<string, string> {
    const e: Record<string, string> = {};
    if (!f.client.trim()) e.client = "Client is required";
    if (!f.cargo.trim()) e.cargo = "Cargo description is required";
    const w = Number(f.weightKg);
    if (!f.weightKg || !Number.isFinite(w)) e.weightKg = "Weight is required";
    else if (w < 100 || w > 40000) e.weightKg = "Weight must be between 100 and 40,000 kg";
    const v = Number(f.volumeM3);
    if (!f.volumeM3 || !Number.isFinite(v) || v <= 0) e.volumeM3 = "Volume must be a positive number";
    if (!f.originCity) e.originCity = "Select origin city";
    if (!f.destCity) e.destCity = "Select destination city";
    else if (f.originCity === f.destCity) e.destCity = "Destination must differ from origin";
    if (!f.plannedDeparture) e.plannedDeparture = "Planned departure is required";
    return e;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Fix the highlighted fields to create the shipment");
      return;
    }
    create.mutate(
      {
        client: form.client.trim(),
        cargo: form.cargo.trim(),
        weightKg: Number(form.weightKg),
        volumeM3: Number(form.volumeM3),
        originCity: form.originCity,
        destCity: form.destCity,
        priority: form.priority,
        plannedDeparture: new Date(form.plannedDeparture).toISOString(),
      },
      {
        onSuccess: (res) => {
          const road = res.sources?.find((s) => s.name.includes("road data"));
          toast.success(
            road
              ? `${res.shipment.ref} created · ${road.detail} (OSRM)`
              : `${res.shipment.ref} created`,
          );
          setForm(EMPTY_FORM);
          setErrors({});
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scrollbar-slim sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-ink">New shipment</DialogTitle>
          <DialogDescription>
            Creates a consignment with an auto-generated ref and an instant rule-based risk score.
          </DialogDescription>
        </DialogHeader>
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={submit} noValidate>
          <Field label="Client" error={errors.client}>
            <Input value={form.client} onChange={(e) => set({ client: e.target.value })} placeholder="Acme Steel" />
          </Field>
          <Field label="Cargo" error={errors.cargo}>
            <Input value={form.cargo} onChange={(e) => set({ cargo: e.target.value })} placeholder="Steel coils" />
          </Field>
          <Field label="Weight (kg)" error={errors.weightKg}>
            <Input
              type="number"
              min={100}
              max={40000}
              value={form.weightKg}
              onChange={(e) => set({ weightKg: e.target.value })}
              placeholder="12000"
            />
          </Field>
          <Field label="Volume (m³)" error={errors.volumeM3}>
            <Input
              type="number"
              min={0}
              step="any"
              value={form.volumeM3}
              onChange={(e) => set({ volumeM3: e.target.value })}
              placeholder="28"
            />
          </Field>
          <Field label="Origin city" error={errors.originCity}>
            <Select value={form.originCity} onValueChange={(v) => set({ originCity: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Origin city" />
              </SelectTrigger>
              <SelectContent>
                {HUBS.map((h) => (
                  <SelectItem key={h.city} value={h.city}>
                    {h.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Destination city" error={errors.destCity}>
            <Select value={form.destCity} onValueChange={(v) => set({ destCity: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Destination city" />
              </SelectTrigger>
              <SelectContent>
                {HUBS.map((h) => (
                  <SelectItem key={h.city} value={h.city}>
                    {h.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onValueChange={(v) => set({ priority: v })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Planned departure" error={errors.plannedDeparture}>
            <Input
              type="datetime-local"
              value={form.plannedDeparture}
              onChange={(e) => set({ plannedDeparture: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-ink text-paper hover:bg-ink/90" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Create shipment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ==================================================================== */

export function ShipmentDrawer() {
  const id = useUI((s) => s.shipmentDrawerId);
  const openShipment = useUI((s) => s.openShipment);
  const q = useShipment(id);
  const s = q.data?.shipment;
  const events = q.data?.events ?? [];

  const suggestEnabled = !!id && (s?.status === "scheduled" || s?.status === "draft");
  const sug = useSuggestions(suggestEnabled ? id : null);

  const assign = useAssignShipment(id ?? "");
  const advance = useAdvanceShipment(id ?? "");

  const [sugOpen, setSugOpen] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const next = s ? nextStatusOf(s.status) : null;
  const nextLabel = next ? statusLabel(next) : null;
  const canAdvance =
    !!s && !!nextLabel && !["draft", "scheduled", "delivered", "cancelled"].includes(s.status);

  function handleAssign(vehicleId: string) {
    if (!id) return;
    setAssigningId(vehicleId);
    assign.mutate(vehicleId, {
      onSuccess: (res) => toast.success(`Assigned · score ${res.score}`),
      onError: (err) => toast.error(err.message),
      onSettled: () => setAssigningId(null),
    });
  }

  function handleAdvance() {
    advance.mutate(undefined, {
      onSuccess: (res) => toast.success(`Shipment moved to ${statusLabel(res.status as ShipmentStatus)}`),
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && openShipment(null)}>
      <SheetContent side="right" className="flex w-full max-w-xl flex-col gap-0 sm:max-w-xl">
        <SheetTitle className="sr-only">Shipment details</SheetTitle>
        <SheetDescription className="sr-only">Shipment timeline, risk assessment and assignment controls.</SheetDescription>
        {q.isLoading || !s ? (
          q.isError ? (
            <div className="p-6">
              <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
            </div>
          ) : (
            <div className="space-y-4 p-5">
              <PanelSkeleton rows={6} />
            </div>
          )
        ) : (
          <>
            <SheetHeader className="border-b border-line px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openShipment(null)}
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="numeric text-lg text-ink">{s.ref}</span>
                <StatusBadge status={s.status} />
                <RiskBadge band={s.riskBand} score={s.riskScore} />
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto scrollbar-slim p-5">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: "Client", value: s.client, mono: false },
                  { label: "Cargo", value: s.cargo, mono: false },
                  { label: "Weight", value: tons(s.weightKg), mono: true },
                  { label: "Volume", value: `${s.volumeM3} m³`, mono: true },
                  { label: "Distance", value: km(s.distanceKm), mono: true },
                  { label: "Cost", value: inr(s.costInr), mono: true },
                ].map((it) => (
                  <div key={it.label} className="rounded-lg bg-surface-2 px-3 py-2.5">
                    <p className="overline-label text-ink-2">{it.label}</p>
                    <p
                      className={cn(
                        "mt-1 truncate text-sm font-medium text-ink",
                        it.mono && "numeric"
                      )}
                    >
                      {it.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Route */}
              <section className="rounded-xl border border-line bg-card p-4">
                <SectionLabel>Route</SectionLabel>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  <span>{s.originCity}</span>
                  <ArrowRight className="h-4 w-4 text-brand" aria-hidden="true" />
                  <span>{s.destCity}</span>
                  {s.routeLabel ? (
                    <span className="numeric rounded-full bg-muted px-2 py-0.5 text-[10px] text-ink-2">
                      {s.routeLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="overline-label text-ink-2">Planned departure</p>
                    <p className="numeric mt-0.5 text-xs text-ink">{dateTime(s.plannedDeparture)}</p>
                  </div>
                  <div>
                    <p className="overline-label text-ink-2">ETA</p>
                    <p className="numeric mt-0.5 text-xs text-ink">{dateTime(s.etaAt)}</p>
                  </div>
                </div>
              </section>

              {/* Risk */}
              <section className="rounded-xl border border-line bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionLabel>Risk assessment</SectionLabel>
                  <DataStatusBadge status="rule_based" />
                </div>
                <p className="mt-1.5 text-xs text-ink-2">
                  Why this score — each factor below shows its contribution to the 0–100 risk score.
                </p>
                <div className="mt-3 space-y-3">
                  {s.riskFactors.length === 0 ? (
                    <p className="text-xs text-ink-2">No factor breakdown recorded for this shipment.</p>
                  ) : (
                    s.riskFactors.map((f) => (
                      <FactorBar
                        key={f.factor}
                        label={f.factor}
                        contribution={f.contribution}
                        detail={f.detail}
                        tone="brand"
                      />
                    ))
                  )}
                </div>
              </section>

              {/* Timeline */}
              <section>
                <SectionLabel>Timeline</SectionLabel>
                {events.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-2">No events recorded yet.</p>
                ) : (
                  <div className="relative mt-3 space-y-4">
                    <div
                      className="absolute bottom-2 left-[5px] top-2 w-px bg-line"
                      aria-hidden="true"
                    />
                    {events.map((e) => (
                      <div key={e.id} className="relative flex gap-3">
                        <span
                          className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-ai bg-card"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-sm leading-snug text-ink">{e.note}</p>
                          <p className="numeric mt-0.5 text-xs text-ink-2">
                            {e.city ? `${e.city} · ` : ""}
                            {timeAgo(e.at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* AI suggestions */}
              {suggestEnabled ? (
                <section className="rounded-xl border border-line bg-surface-2 p-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2"
                    onClick={() => setSugOpen((o) => !o)}
                    aria-expanded={sugOpen}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <Sparkles className="h-4 w-4 text-ai" aria-hidden="true" />
                      <SectionLabel className="text-ink">AI suggestions</SectionLabel>
                      {sug.data ? <MetaBadges meta={sug.data.meta} /> : null}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-ink-2 transition-transform",
                        sugOpen && "rotate-180"
                      )}
                      aria-hidden="true"
                    />
                  </button>
                  {sugOpen ? (
                    sug.isLoading ? (
                      <PanelSkeleton rows={3} className="mt-3" />
                    ) : sug.isError ? (
                      <p className="mt-3 text-xs text-danger">{sug.error.message}</p>
                    ) : !sug.data || sug.data.suggestions.length === 0 ? (
                      <p className="mt-3 text-xs text-ink-2">
                        No eligible vehicles right now — capacity or proximity thresholds filter the fleet.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2.5">
                        {sug.data.suggestions.slice(0, 3).map((sv) => {
                          const top = sv.breakdown[0];
                          return (
                            <ScoreRow
                              key={sv.vehicle.id}
                              score={sv.score}
                              left={
                                <div className="min-w-0">
                                  <p className="numeric text-sm font-semibold text-ink">
                                    {sv.vehicle.regNo}
                                  </p>
                                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-2">
                                    <MapPin className="h-3 w-3" aria-hidden="true" />
                                    {sv.vehicle.typeLabel} · {sv.vehicle.currentCity}
                                  </p>
                                </div>
                              }
                              detail={top ? `${top.factor}: ${top.detail}` : undefined}
                              action={
                                <Button
                                  size="sm"
                                  className="min-h-[36px] bg-ink text-paper hover:bg-ink/90"
                                  disabled={assign.isPending}
                                  onClick={() => handleAssign(sv.vehicle.id)}
                                >
                                  {assigningId === sv.vehicle.id && (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                  )}
                                  Assign
                                </Button>
                              }
                            />
                          );
                        })}
                      </div>
                    )
                  ) : null}
                </section>
              ) : null}
            </div>

            {/* Footer actions */}
            <div className="border-t border-line bg-surface-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-ink-2">
                  {s.status === "draft" || s.status === "scheduled"
                    ? "Pick a suggested vehicle above — assigning reserves it and logs an event."
                    : "All transitions are event-logged"}
                </p>
                {canAdvance ? (
                  <Button
                    className="bg-ink text-paper hover:bg-ink/90"
                    disabled={advance.isPending}
                    onClick={handleAdvance}
                  >
                    {advance.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    )}
                    Advance to {nextLabel}
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
