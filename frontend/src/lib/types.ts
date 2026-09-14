/** Shared domain types, enums and the shipment status machine. */

export const ROLES = ["ORG_ADMIN", "OPS_MANAGER", "DISPATCHER", "FLEET_MANAGER", "ANALYST", "DRIVER", "CUSTOMER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ORG_ADMIN: "Org Admin",
  OPS_MANAGER: "Operations Manager",
  DISPATCHER: "Dispatcher",
  FLEET_MANAGER: "Fleet Manager",
  ANALYST: "Analyst",
  DRIVER: "Driver",
  CUSTOMER: "Consignee",
};

/** Roles allowed to mutate (write) operations data. */
export const WRITE_ROLES: Role[] = ["ORG_ADMIN", "OPS_MANAGER", "DISPATCHER", "FLEET_MANAGER"];

export const SHIPMENT_STATUSES = ["draft", "scheduled", "assigned", "in_transit", "delivered", "cancelled", "exception"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const STATUS_MACHINE: Record<ShipmentStatus, ShipmentStatus[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["assigned", "cancelled"],
  assigned: ["in_transit", "scheduled", "cancelled"],
  in_transit: ["delivered", "exception"],
  exception: ["in_transit", "cancelled"],
  delivered: [],
  cancelled: [],
};

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  assigned: "Assigned",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
  exception: "Exception",
};

export type RiskBand = "low" | "medium" | "high" | "critical";

export type DataStatus = "live" | "demo" | "mock" | "rule_based" | "optimization" | "planned";

export const VEHICLE_TYPES = [
  { id: "TRAILER_40", label: "40ft Trailer", capacityKg: 28000, capacityM3: 68 },
  { id: "CONTAINER_32", label: "32ft SXL Container", capacityKg: 18000, capacityM3: 45 },
  { id: "REEFER_32", label: "32ft Reefer", capacityKg: 16000, capacityM3: 42 },
  { id: "TRUCK_24", label: "24ft Truck", capacityKg: 9000, capacityM3: 28 },
  { id: "MINI_TRUCK", label: "Mini Truck", capacityKg: 3500, capacityM3: 14 },
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number]["id"];

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgId: string;
  orgName: string;
  orgDemo: boolean;
}

export interface RiskFactor {
  factor: string;
  contribution: number;
  detail: string;
}

export interface RecommendationDTO {
  id: string;
  type: string;
  refId?: string | null;
  title: string;
  summary: string;
  confidence: number;
  reasons: string[];
  impact: { time_min?: number; cost_inr?: number; co2_kg?: number; risk_delta?: number };
  status: "pending" | "approved" | "rejected";
  dataStatus: DataStatus;
  createdAt: string;
}

export interface ShipmentDTO {
  id: string;
  ref: string;
  client: string;
  cargo: string;
  weightKg: number;
  volumeM3: number;
  status: ShipmentStatus;
  priority: "standard" | "priority" | "critical";
  originCity: string;
  destCity: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  distanceKm: number;
  plannedDeparture: string;
  etaAt: string;
  assignedVehicleId?: string | null;
  assignedDriverId?: string | null;
  vehicleReg?: string | null;
  driverName?: string | null;
  costInr: number;
  riskBand: RiskBand;
  riskScore: number;
  riskFactors: RiskFactor[];
  progress: number;
  routeLabel?: string | null;
  createdAt: string;
}

export interface VehicleDTO {
  id: string;
  regNo: string;
  type: string;
  typeLabel: string;
  capacityKg: number;
  capacityM3: number;
  status: "available" | "in_use" | "maintenance";
  healthScore: number;
  odometerKm: number;
  lastServiceOdometerKm: number;
  fuelEffKmpl: number;
  currentCity: string;
  lat: number;
  lng: number;
  currentShipmentRef?: string | null;
}

export interface DriverDTO {
  id: string;
  name: string;
  phone: string;
  licenseNo: string;
  status: "available" | "on_duty" | "off_duty";
  hoursToday: number;
  rating: number;
  trips: number;
  onTimePct: number;
}

export interface DisruptionDTO {
  id: string;
  type: "weather" | "traffic" | "breakdown" | "strike" | "regulatory";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  corridor: string;
  note: string;
  status: "open" | "monitoring" | "resolved";
  affectedCount: number;
  steps: string[];
  stepIndex: number;
  log: { at: string; entry: string }[];
  createdAt: string;
  resolvedAt?: string | null;
}

export interface ThresholdsDTO {
  config: Record<string, Record<string, number>>;
  meta: { version: number; configHash: string; updatedAt: string; updatedBy?: string | null; schemaVersion: string };
  schema: ThresholdSchemaSection[];
}

export interface ThresholdSchemaSection {
  key: string;
  label: string;
  fields: {
    key: string;
    label: string;
    description: string;
    unit: string;
    min: number;
    max: number;
    step: number;
    value: number;
    defaultValue: number;
  }[];
}

export interface Meta {
  dataStatus: DataStatus;
  configVersion: string;
}

export const APP_NAME = "Logistics Autopilot";
export const SESSION_COOKIE = "apaas_session";
