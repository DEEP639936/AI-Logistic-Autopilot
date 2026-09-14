"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMe, login } from "@/lib/api";
import { useUI } from "@/lib/store";
import { LogoMark } from "@/components/brand";
import LandingPage from "@/components/landing/LandingPage";
import AuthScreen from "@/components/app/auth-screen";
import AppShell from "@/components/app/shell";
import { toast } from "sonner";

export default function Page() {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  );
}

function Root() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading } = useMe();
  const surface = useUI((s) => s.surface);
  const setSurface = useUI((s) => s.setSurface);
  const setAuthMode = useUI((s) => s.setAuthMode);
  const setTab = useUI((s) => s.setTab);

  const authed = !!data?.user;

  const goSignIn = () => {
    setAuthMode("signin");
    setSurface("auth");
  };

  const launchDemo = async () => {
    try {
      await login("admin@meridian.in", "Demo@12345");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setTab("command");
      setSurface("app");
      router.refresh();
      toast.success("Welcome aboard — signed in as Meridian Org Admin (demo)");
    } catch {
      setAuthMode("signin");
      setSurface("auth");
      toast.info("Use admin@meridian.in · Demo@12345 to enter the demo");
    }
  };

  if (isLoading) return <Splash />;

  /* Session wins over local surface state (deep-links, refresh). */
  if (authed && surface !== "site") return <AppShell />;
  if (authed && surface === "site") return <LandingPage onSignIn={() => setSurface("app")} onLaunchDemo={() => setSurface("app")} />;
  if (surface === "auth") return <AuthScreen />;
  return <LandingPage onSignIn={goSignIn} onLaunchDemo={launchDemo} />;
}

function Splash() {
  return (
    <div className="grain relative flex min-h-screen flex-col items-center justify-center gap-4 bg-paper">
      <LogoMark size={44} />
      <div className="flex items-center gap-2 text-xs text-ink-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
        Warming up the command center…
      </div>
    </div>
  );
}
