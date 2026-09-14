"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DisruptionDTO,
  DriverDTO,
  RecommendationDTO,
  RiskFactor,
  ShipmentDTO,
  ThresholdsDTO,
  VehicleDTO,
  SessionUser,
  DataStatus,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Typed fetcher with error envelope handling                          */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "include",
  });
  if (!res.ok) {
    let code = "ERROR";
    let message = `Request failed (${res.status})`;
    let details: unknown = null;
    try {
      const j = await res.json();
      if (j?.error) {
        code = j.error.code ?? code;
        message = j.error.message ?? message;
        details = j.error.details ?? null;
      }
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(code, message, res.status, details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: SessionUser | null }>("/api/auth/me"),
    staleTime: 60_000,
  });
}

export async function login(email: string, password: string) {
  return api<{ user: SessionUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(input: { name: string; email: string; password: string; orgName: string }) {
  return api<{ user: SessionUser }>("/api/auth/register", { method: "POST", body: JSON.stringify(input) });
}

export async function logout() {
  return api<void>("/api/auth/logout", { method: "POST" });
}

/* ------------------------------------------------------------------ */
/* Overview / command center                                           */
/* ------------------------------------------------------------------ */

export interface OverviewDTO {
  kpis: {
    activeShipments: number;
    onTimePct: number;
    atRisk: number;
    fleetUtilizationPct: number;
    costPerKmInr: number;
    co2TodayKg: number;
  };
  riskFeed: {
    shipmentId: string;
    ref: string;
    route: string;
    riskScore: number;
    riskBand: string;
    etaAt: string;
    slackMin: number;
    topReason: string;
    weather: { label: string; risk: number; precipMm: number; tempC: number } | null;
  }[];
  recommendations: RecommendationDTO[];
  activity: { id: string; at: string; type: string; note: string; ref?: string }[];
  map: {
    hubs: { city: string; lat: number; lng: number }[];
    vehicles: { id: string; regNo: string; lat: number; lng: number; status: string; city: string }[];
    live: { id: string; ref: string; from: [number, number]; to: [number, number]; progress: number; riskBand: string; vehicleReg: string }[];
    disruptions: { id: string; title: string; severity: string; lat: number; lng: number }[];
  };
  fleetStatus: { available: number; inUse: number; maintenance: number };
  liveWeather: { city: string; tempC: number; precipMm: number; windKph: number; label: string; precipTodayMm: number; risk: number }[];
  liveSources: { name: string; status: DataStatus; url: string }[];
  meta: { dataStatus: DataStatus; configVersion: string; demoSimulator: boolean; tickSeconds: number };
}

export function useOverview() {
  return useQuery({
    queryKey: ["overview"],
    queryFn: () => api<OverviewDTO>("/api/overview"),
    refetchInterval: 15_000,
  });
}

/* ------------------------------------------------------------------ */
/* Shipments                                                           */
/* ------------------------------------------------------------------ */

export interface ShipmentListQuery {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export function useShipments(q: ShipmentListQuery) {
  const search = new URLSearchParams();
  if (q.status) search.set("status", q.status);
  if (q.q) search.set("q", q.q);
  search.set("page", String(q.page ?? 1));
  search.set("pageSize", String(q.pageSize ?? 10));
  return useQuery({
    queryKey: ["shipments", q],
    queryFn: () => api<{ items: ShipmentDTO[]; total: number; page: number; pageSize: number }>(`/api/shipments?${search.toString()}`),
  });
}

export function useShipment(id: string | null) {
  return useQuery({
    queryKey: ["shipment", id],
    queryFn: () =>
      api<{ shipment: ShipmentDTO; events: { id: string; at: string; type: string; note: string; city?: string }[] }>(`/api/shipments/${id}`),
    enabled: !!id,
  });
}

export interface VehicleSuggestion {
  vehicle: VehicleDTO;
  score: number;
  breakdown: { factor: string; value: number; detail: string }[];
}

export function useSuggestions(id: string | null) {
  return useQuery({
    queryKey: ["suggestions", id],
    queryFn: () => api<{ suggestions: VehicleSuggestion[]; meta: { dataStatus: DataStatus; configVersion: string } }>(`/api/shipments/${id}/suggestions`),
    enabled: !!id,
  });
}

export function useCreateShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      client: string;
      cargo: string;
      weightKg: number;
      volumeM3: number;
      originCity: string;
      destCity: string;
      plannedDeparture: string;
      priority: string;
    }) =>
      api<{
        shipment: ShipmentDTO;
        sources?: { name: string; status: string; detail: string }[];
      }>("/api/shipments", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

export function useAssignShipment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: string) =>
      api<{ score: number; reasons: string[] }>(`/api/shipments/${id}/assign`, { method: "POST", body: JSON.stringify({ vehicleId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["shipment", id] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["fleet"] });
    },
  });
}

export function useAdvanceShipment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ status: string }>(`/api/shipments/${id}/advance`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["shipment", id] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Fleet                                                               */
/* ------------------------------------------------------------------ */

export interface FleetDTO {
  vehicles: VehicleDTO[];
  drivers: DriverDTO[];
  summary: { available: number; inUse: number; maintenance: number; utilizationPct: number };
  maintenanceFlags: { vehicleId: string; regNo: string; issue: string; severity: "warning" | "critical"; detail: string }[];
  meta: { dataStatus: DataStatus; configVersion: string };
}

export function useFleet() {
  return useQuery({ queryKey: ["fleet"], queryFn: () => api<FleetDTO>("/api/fleet") });
}

/* ------------------------------------------------------------------ */
/* Route optimization                                                  */
/* ------------------------------------------------------------------ */

export interface RouteAlternative {
  id: string;
  label: string;
  summary: string;
  distanceKm: number;
  etaMin: number;
  costInr: number;
  tollsInr: number;
  fuelInr: number;
  co2Kg: number;
  riskScore: number;
  riskBand: string;
  segments: { label: string; road: string; km: number; note: string }[];
  factors: { factor: string; contribution: number; detail: string }[];
  dataStatus: DataStatus;
  roadLive: boolean;
}

export interface OptimizeResponse {
  alternatives: RouteAlternative[];
  recommendedIndex: number;
  meta: { dataStatus: DataStatus; configVersion: string };
  shipment?: ShipmentDTO;
  live: { roads: boolean; weather: { label: string; risk: number; ends: { city: string; label: string; tempC: number; precipMm: number; risk: number }[] } | null };
  sources: { name: string; status: DataStatus; url: string; detail: string }[];
}

export function useOptimize() {
  return useMutation({
    mutationFn: (input: { shipmentId?: string; originCity: string; destCity: string; weightKg: number; cargoType: string }) =>
      api<OptimizeResponse>("/api/routes/optimize", { method: "POST", body: JSON.stringify(input) }),
  });
}

/* ------------------------------------------------------------------ */
/* Consolidation & return loads                                        */
/* ------------------------------------------------------------------ */

export interface ConsolidationGroup {
  id: string;
  corridor: string;
  shipments: { id: string; ref: string; client: string; weightKg: number; volumeM3: number; destCity: string }[];
  totalWeightKg: number;
  fillWeightPct: number;
  fillVolPct: number;
  savingsInr: number;
  savingsPct: number;
  departureWindow: string;
}

export function useConsolidation() {
  return useQuery({ queryKey: ["consolidation"], queryFn: () => api<{ groups: ConsolidationGroup[]; meta: { dataStatus: DataStatus; configVersion: string } }>("/api/consolidation") });
}

export function useApplyConsolidation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shipmentIds: string[]) =>
      api<{ ref: string; savingsInr: number }>("/api/consolidation/apply", { method: "POST", body: JSON.stringify({ shipmentIds }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consolidation"] });
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

export interface ReturnLoadMatch {
  id: string;
  vehicle: { id: string; regNo: string; typeLabel: string; currentCity: string; lat: number; lng: number };
  load: { ref: string; client: string; cargo: string; weightKg: number; destCity: string; payInr: number };
  detourKm: number;
  score: number;
  scoreBreakdown: { factor: string; contribution: number; detail: string }[];
  profitInr: number;
}

export function useReturnLoads() {
  return useQuery({ queryKey: ["return-loads"], queryFn: () => api<{ matches: ReturnLoadMatch[]; meta: { dataStatus: DataStatus; configVersion: string } }>("/api/return-loads") });
}

export function useAcceptReturnLoad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) => api<{ ok: boolean }>("/api/return-loads/accept", { method: "POST", body: JSON.stringify({ matchId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["return-loads"] });
      qc.invalidateQueries({ queryKey: ["fleet"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Disruptions                                                         */
/* ------------------------------------------------------------------ */

export function useDisruptions() {
  return useQuery({
    queryKey: ["disruptions"],
    queryFn: () => api<{ incidents: DisruptionDTO[]; meta: { dataStatus: DataStatus } }>("/api/disruptions"),
    refetchInterval: 20_000,
  });
}

export function useDisruptionAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: "run_playbook" | "resolve" | "escalate" }) =>
      api<{ incident: DisruptionDTO; affected: string[] }>(`/api/disruptions/${input.id}/action`, { method: "POST", body: JSON.stringify({ action: input.action }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["disruptions"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["shipments"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export interface AnalyticsDTO {
  onTimeSeries: { date: string; onTimePct: number; shipments: number }[];
  costSeries: { date: string; costPerKm: number }[];
  co2Series: { date: string; co2Kg: number }[];
  utilizationSeries: { date: string; utilizationPct: number }[];
  topCorridors: { corridor: string; shipments: number; onTimePct: number; avgCostInr: number }[];
  driverLeaderboard: { name: string; trips: number; onTimePct: number; rating: number }[];
  statusBreakdown: { status: string; count: number }[];
  meta: { dataStatus: DataStatus; configVersion: string };
}

export function useAnalytics(days: number) {
  return useQuery({ queryKey: ["analytics", days], queryFn: () => api<AnalyticsDTO>(`/api/analytics?days=${days}`) });
}

/* ------------------------------------------------------------------ */
/* Recommendations                                                     */
/* ------------------------------------------------------------------ */

export function useDecideRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: "approve" | "reject" }) =>
      api<{ id: string; status: string }>(`/api/recommendations/${input.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ action: input.action }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Copilot                                                             */
/* ------------------------------------------------------------------ */

export function useCopilot() {
  return useMutation({
    mutationFn: (input: { message: string; history: { role: "user" | "assistant"; content: string }[] }) =>
      api<{ reply: string; sources: string[]; dataStatus: DataStatus }>("/api/copilot", { method: "POST", body: JSON.stringify(input) }),
  });
}

/* ------------------------------------------------------------------ */
/* Thresholds                                                          */
/* ------------------------------------------------------------------ */

export function useThresholds() {
  return useQuery({ queryKey: ["thresholds"], queryFn: () => api<ThresholdsDTO>("/api/thresholds") });
}

export function usePutThresholds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: Record<string, Record<string, number>>) =>
      api<{ version: number; configHash: string }>("/api/thresholds", { method: "PUT", body: JSON.stringify({ config }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["thresholds"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

export function useResetThresholds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ version: number; configHash: string }>("/api/thresholds/reset", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["thresholds"] }),
  });
}

/* ------------------------------------------------------------------ */
/* Notifications & demo                                                */
/* ------------------------------------------------------------------ */

export interface NotificationDTO {
  id: string;
  title: string;
  body: string;
  kind: string;
  read: boolean;
  createdAt: string;
}

export function useNotifications() {
  return useQuery({ queryKey: ["notifications"], queryFn: () => api<{ items: NotificationDTO[]; unread: number }>("/api/notifications") });
}

export function useMarkNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids?: string[]; all?: boolean }) =>
      api<void>("/api/notifications/read", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export async function submitDemoRequest(input: { name: string; email: string; org: string; fleetSize: string; message: string }) {
  return api<{ ok: boolean }>("/api/demo-request", { method: "POST", body: JSON.stringify(input) });
}
