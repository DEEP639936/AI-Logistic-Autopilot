"use client";

import { create } from "zustand";

export type Surface = "site" | "auth" | "app";
export type AuthMode = "signin" | "signup";
export type AppTab =
  | "command"
  | "shipments"
  | "fleet"
  | "routes"
  | "disruptions"
  | "consolidation"
  | "return-loads"
  | "analytics"
  | "copilot"
  | "thresholds";

interface UIState {
  surface: Surface;
  authMode: AuthMode;
  tab: AppTab;
  shipmentDrawerId: string | null;
  paletteOpen: boolean;
  sidebarCollapsed: boolean;
  copilotOpen: boolean;
  setSurface: (s: Surface) => void;
  setAuthMode: (m: AuthMode) => void;
  setTab: (t: AppTab) => void;
  openShipment: (id: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setCopilotOpen: (open: boolean) => void;
}

/* Survive reloads within the tab (never leak across users via sessionStorage). */
const KEY = "apaas-ui";
function loadPersisted(): { surface?: Surface; tab?: AppTab } {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}
function persist(state: { surface: Surface; tab: AppTab }) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ surface: state.surface, tab: state.tab }));
  } catch {
    /* storage unavailable */
  }
}

const initial = loadPersisted();

export const useUI = create<UIState>((set) => ({
  surface: initial.surface ?? "site",
  authMode: "signin",
  tab: initial.tab ?? "command",
  shipmentDrawerId: null,
  paletteOpen: false,
  sidebarCollapsed: false,
  copilotOpen: false,
  setSurface: (surface) => {
    set({ surface });
    persist({ surface, tab: useUI.getState().tab });
  },
  setAuthMode: (authMode) => set({ authMode }),
  setTab: (tab) => {
    set({ tab, shipmentDrawerId: null });
    persist({ surface: useUI.getState().surface, tab });
  },
  openShipment: (shipmentDrawerId) => set({ shipmentDrawerId }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCopilotOpen: (copilotOpen) => set({ copilotOpen }),
}));
