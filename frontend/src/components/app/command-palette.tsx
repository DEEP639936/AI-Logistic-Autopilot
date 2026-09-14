"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3, Boxes, LayoutDashboard, Layers, LogOut, Repeat, Route, Siren, SlidersHorizontal, Sparkles, Truck, User,
} from "lucide-react";
import { logout } from "@/lib/api";
import { useUI, type AppTab } from "@/lib/store";
import { toast } from "sonner";

const ITEMS: { tab?: AppTab; label: string; hint: string; icon: React.ComponentType<{ className?: string }>; action?: "copilot" | "signout" | "site" }[] = [
  { tab: "command", label: "Command Center", hint: "KPIs, network map, risk radar", icon: LayoutDashboard },
  { tab: "shipments", label: "Shipments", hint: "Plan, assign and track", icon: Boxes },
  { tab: "fleet", label: "Fleet & Drivers", hint: "Vehicles, crews, maintenance", icon: Truck },
  { tab: "routes", label: "Route Intelligence", hint: "Compare corridor alternatives", icon: Route },
  { tab: "consolidation", label: "Load Consolidation", hint: "Fill trucks, save cost", icon: Layers },
  { tab: "return-loads", label: "Return-Load Matching", hint: "Monetize empty legs", icon: Repeat },
  { tab: "disruptions", label: "Disruption Control", hint: "Incidents and playbooks", icon: Siren },
  { tab: "analytics", label: "Analytics", hint: "Trends and leaderboards", icon: BarChart3 },
  { tab: "thresholds", label: "AI & Operational Thresholds", hint: "Tune every engine", icon: SlidersHorizontal },
  { action: "copilot", label: "Open Copilot", hint: "Ask your operations anything", icon: Sparkles },
  { action: "site", label: "View marketing site", hint: "Landing page", icon: Sparkles },
];

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const setOpen = useUI((s) => s.setPaletteOpen);
  const setTab = useUI((s) => s.setTab);
  const router = useRouter();

  const run = (item: (typeof ITEMS)[number]) => {
    setOpen(false);
    if (item.action === "copilot") {
      useUI.getState().setCopilotOpen(true);
    } else if (item.action === "site") {
      useUI.getState().setSurface("site");
    } else if (item.action === "signout") {
      logout().then(() => {
        toast("Signed out");
        router.refresh();
        useUI.getState().setSurface("site");
      });
    } else if (item.tab) {
      setTab(item.tab);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
          aria-hidden
        >
          <div className="mx-auto mt-[14vh] w-[min(560px,calc(100vw-2rem))]" onClick={(e) => e.stopPropagation()}>
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-label="Command palette"
              className="overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
            >
              <Command label="Command palette" className="[&_[cmdk-group-heading]]:overline-label [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-ink-2/70">
                <div className="flex items-center gap-2.5 border-b border-line px-4">
                  <Sparkles className="h-4 w-4 shrink-0 text-brand" />
                  <Command.Input
                    autoFocus
                    placeholder="Jump to a workspace or run an action…"
                    className="h-12 w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-2/60"
                  />
                  <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] text-ink-2">ESC</kbd>
                </div>
                <Command.List className="max-h-[340px] overflow-y-auto p-1.5 scrollbar-slim">
                  <Command.Empty className="px-3 py-8 text-center text-xs text-ink-2">
                    Nothing matches — try &ldquo;route&rdquo;, &ldquo;fleet&rdquo; or &ldquo;copilot&rdquo;.
                  </Command.Empty>
                  <Command.Group heading="Navigate">
                    {ITEMS.filter((i) => !i.action).map((item) => (
                      <Command.Item
                        key={item.label}
                        value={`${item.label} ${item.hint}`}
                        onSelect={() => run(item)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-ink data-[selected=true]:bg-ink data-[selected=true]:text-paper"
                      >
                        <item.icon className="h-4 w-4 text-brand data-[selected=true]:text-paper" />
                        <span className="font-medium">{item.label}</span>
                        <span className="ml-auto text-[10.5px] text-ink-2 data-[selected=true]:text-paper/60">{item.hint}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  <Command.Group heading="Actions">
                    <Command.Item
                      value="sign out"
                      onSelect={() => { setOpen(false); logout().then(() => { toast("Signed out"); router.refresh(); useUI.getState().setSurface("site"); useUI.getState().setTab("command"); }); }}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-danger data-[selected=true]:bg-danger data-[selected=true]:text-white"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </Command.Item>
                    <Command.Item
                      value="account profile"
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-ink data-[selected=true]:bg-ink data-[selected=true]:text-paper"
                      onSelect={() => setOpen(false)}
                    >
                      <User className="h-4 w-4 text-brand" />
                      Account · managed by your Org Admin
                    </Command.Item>
                  </Command.Group>
                </Command.List>
              </Command>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
