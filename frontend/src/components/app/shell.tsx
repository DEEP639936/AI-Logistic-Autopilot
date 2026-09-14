"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3, Bell, Boxes, ChevronsLeft, ChevronsRight, Command, Fuel, Gauge, LayoutDashboard, Layers, LogOut,
  PanelTopOpen, Repeat, Route, Search, Siren, SlidersHorizontal, Sparkles, Truck, Home,
} from "lucide-react";
import { toast } from "sonner";
import { useMe, useNotifications, useMarkNotifications, logout, useOverview } from "@/lib/api";
import { useUI, type AppTab } from "@/lib/store";
import { LogoMark } from "@/components/brand";
import { ROLE_LABELS } from "@/lib/types";
import type { Role } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/app/command-palette";
import { cn } from "@/lib/utils";

import ShipmentsView from "@/components/views/ShipmentsView";
import FleetView from "@/components/views/FleetView";
import DisruptionsView from "@/components/views/DisruptionsView";
import ConsolidationView from "@/components/views/ConsolidationView";
import ReturnLoadsView from "@/components/views/ReturnLoadsView";
import AnalyticsView from "@/components/views/AnalyticsView";
import CommandCenter from "@/components/app/command-center";
import RoutesView from "@/components/app/routes-view";
import ThresholdsView from "@/components/app/thresholds-view";
import { CopilotDock } from "@/components/app/copilot-panel";
import { ShipmentDrawerHost } from "@/components/app/shipment-drawer";

const NAV: { tab: AppTab; label: string; icon: React.ComponentType<{ className?: string }>; group: string }[] = [
  { tab: "command", label: "Command Center", icon: LayoutDashboard, group: "Operate" },
  { tab: "shipments", label: "Shipments", icon: Boxes, group: "Operate" },
  { tab: "fleet", label: "Fleet & Drivers", icon: Truck, group: "Operate" },
  { tab: "routes", label: "Route Intelligence", icon: Route, group: "Optimize" },
  { tab: "consolidation", label: "Consolidation", icon: Layers, group: "Optimize" },
  { tab: "return-loads", label: "Return Loads", icon: Repeat, group: "Optimize" },
  { tab: "disruptions", label: "Disruption Control", icon: Siren, group: "Respond" },
  { tab: "analytics", label: "Analytics", icon: BarChart3, group: "Respond" },
  { tab: "thresholds", label: "AI Thresholds", icon: SlidersHorizontal, group: "Configure" },
];

export default function AppShell() {
  const { data: meData } = useMe();
  const user = meData?.user ?? null;
  const { tab, setTab, sidebarCollapsed, toggleSidebar, setPaletteOpen, copilotOpen, setCopilotOpen } = useUI();
  const router = useRouter();

  /* Global ⌘K */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  /* Collapse the rail on tablet/phone so content keeps the room it needs. */
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => {
      if (mq.matches && !useUI.getState().sidebarCollapsed) useUI.getState().toggleSidebar();
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const signOut = async () => {
    await logout();
    toast("Signed out — see you on the next dispatch");
    router.refresh();
    useUI.getState().setSurface("site");
    useUI.getState().setTab("command");
  };

  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Sidebar */}
      <motion.aside
        animate={{ width: sidebarCollapsed ? 68 : 248 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 flex h-screen shrink-0 flex-col border-r border-line bg-surface-2"
      >
        <div className={cn("flex h-16 items-center gap-2.5 border-b border-line px-4", sidebarCollapsed && "justify-center px-0")}>
          <LogoMark size={sidebarCollapsed ? 26 : 28} />
          {!sidebarCollapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold tracking-tight text-ink">
                Logistics<span className="text-brand">Autopilot</span>
              </p>
              <p className="truncate text-[10px] text-ink-2">{user?.orgName ?? "—"}</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-4 scrollbar-slim" aria-label="App navigation">
          {groups.map((group) => (
            <div key={group}>
              {!sidebarCollapsed && <p className="overline-label px-2 pb-1.5 text-[9px] text-ink-2/70">{group}</p>}
              <ul className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map((item) => {
                  const active = tab === item.tab;
                  return (
                    <li key={item.tab}>
                      <button
                        onClick={() => setTab(item.tab)}
                        title={sidebarCollapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition",
                          active ? "bg-ink text-paper shadow-sm" : "text-ink-2 hover:bg-muted hover:text-ink",
                          sidebarCollapsed && "justify-center px-0",
                        )}
                      >
                        <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-paper" : "text-ink-2 group-hover:text-ink")} />
                        {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        {active && !sidebarCollapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div>
            {!sidebarCollapsed && <p className="overline-label px-2 pb-1.5 text-[9px] text-ink-2/70">Assist</p>}
            <ul>
              <li>
                <button
                  onClick={() => setCopilotOpen(!copilotOpen)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition text-ai hover:bg-ai-soft",
                    sidebarCollapsed && "justify-center px-0",
                  )}
                >
                  <Sparkles className="h-4 w-4" />
                  {!sidebarCollapsed && "Copilot"}
                </button>
              </li>
            </ul>
          </div>
        </nav>

        <div className="space-y-2 border-t border-line p-2.5">
          {!sidebarCollapsed && user && (
            <div className="flex items-center gap-2.5 rounded-lg bg-card px-2.5 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-paper">
                {user.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[12px] font-semibold text-ink">{user.name}</p>
                <p className="truncate text-[10px] text-ink-2">{ROLE_LABELS[user.role as Role]}</p>
              </div>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink-2 transition hover:bg-muted hover:text-ink", sidebarCollapsed && "justify-center")}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
            {!sidebarCollapsed && "Collapse"}
          </button>
        </div>
      </motion.aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {tab === "command" && <CommandCenter />}
              {tab === "shipments" && <ShipmentsView />}
              {tab === "fleet" && <FleetView />}
              {tab === "routes" && <RoutesView />}
              {tab === "consolidation" && <ConsolidationView />}
              {tab === "return-loads" && <ReturnLoadsView />}
              {tab === "disruptions" && <DisruptionsView />}
              {tab === "analytics" && <AnalyticsView />}
              {tab === "thresholds" && <ThresholdsView />}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="border-t border-line bg-surface-2">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-3 lg:px-8">
            <p className="text-[10.5px] text-ink-2">
              AI Logistics Autopilot · Built for Smart India Hackathon 2026 — <span className="font-medium text-ink">live weather &amp; road data</span> (Open-Meteo · BRouter/OSM), fleet ops on a labelled demo dataset
            </p>
            <div className="flex items-center gap-3 text-[10.5px] text-ink-2">
              <span className="flex items-center gap-1.5"><Gauge className="h-3 w-3 text-ai" /> {ROLE_LABELS[(user?.role ?? "OPS_MANAGER") as Role]}</span>
              <button onClick={() => useUI.getState().setSurface("site")} className="flex items-center gap-1 transition hover:text-ink">
                <Home className="h-3 w-3" /> Website
              </button>
            </div>
          </div>
        </footer>
      </div>

      <CommandPalette />
      <CopilotDock />
      <ShipmentDrawerHost />
    </div>
  );
}

/* ---------------- Topbar ---------------- */

function Topbar() {
  const { tab, setPaletteOpen } = useUI();
  const { data: meData } = useMe();
  const { data: notif } = useNotifications();
  const { data: overview } = useOverview();
  const markRead = useMarkNotifications();
  const router = useRouter();
  const [bellOpen, setBellOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const current = NAV.find((n) => n.tab === tab);
  const unread = notif?.unread ?? 0;

  const signOut = async () => {
    await logout();
    toast("Signed out");
    router.refresh();
    useUI.getState().setSurface("site");
    useUI.getState().setTab("command");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line glass">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 lg:px-8">
        <div className="min-w-0">
          <p className="overline-label text-[9px] text-ink-2/70">{current?.group ?? "Operate"}</p>
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink">{current?.label ?? "Command Center"}</h1>
        </div>

        <button
          onClick={() => setPaletteOpen(true)}
          className="ml-auto hidden items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink/20 hover:text-ink md:flex"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
          Search or jump…
          <kbd className="ml-6 flex items-center gap-0.5 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px]">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        {/* connection indicator */}
        <span className="hidden items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1.5 text-[10.5px] font-medium text-ink-2 sm:flex" title={overview?.meta.demoSimulator ? "Demo simulator feed — labelled, not live GPS" : "Feed status"}>
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-success" />
          Demo feed · {overview?.meta.tickSeconds ?? 15}s tick
        </span>

        {/* notifications */}
        <div className="relative">
          <button
            onClick={() => setBellOpen(!bellOpen)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-card text-ink-2 transition hover:text-ink"
            aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          <AnimatePresence>
            {bellOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setBellOpen(false)} aria-hidden />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-xl border border-line bg-card shadow-xl"
                  role="dialog"
                  aria-label="Notification center"
                >
                  <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                    <p className="text-xs font-semibold text-ink">Notifications</p>
                    {unread > 0 && (
                      <button
                        onClick={() => markRead.mutate({ all: true })}
                        className="text-[10.5px] font-medium text-ai underline-offset-2 hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-[380px] overflow-y-auto scrollbar-slim">
                    {(notif?.items ?? []).length === 0 && <p className="px-4 py-8 text-center text-xs text-ink-2">All caught up.</p>}
                    {(notif?.items ?? []).map((n) => (
                      <div key={n.id} className={cn("border-b border-line/60 px-4 py-3", !n.read && "bg-ai-soft/30")}>
                        <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
                          {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-ink-2">{n.body}</p>
                        <p className="mt-1 text-[9.5px] text-ink-2/70">{timeAgo(n.createdAt)} · {n.kind}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* profile */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-paper transition hover:bg-brand"
            aria-label="Profile menu"
          >
            {meData?.user?.name.split(" ").map((p) => p[0]).join("").slice(0, 2) ?? "…"}
          </button>
          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-card shadow-xl"
                  role="menu"
                >
                  <div className="border-b border-line px-4 py-3">
                    <p className="text-[13px] font-semibold text-ink">{meData?.user?.name}</p>
                    <p className="text-[11px] text-ink-2">{meData?.user?.email}</p>
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-ink-2">
                      <Fuel className="h-2.5 w-2.5" /> {meData?.user?.orgName} · {ROLE_LABELS[(meData?.user?.role ?? "OPS_MANAGER") as Role]}
                    </p>
                  </div>
                  <div className="p-1.5">
                    <button onClick={() => { setMenuOpen(false); useUI.getState().setSurface("site"); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-ink-2 transition hover:bg-muted hover:text-ink">
                      <PanelTopOpen className="h-3.5 w-3.5" /> View marketing site
                    </button>
                    <button onClick={signOut} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-danger transition hover:bg-danger-soft">
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
