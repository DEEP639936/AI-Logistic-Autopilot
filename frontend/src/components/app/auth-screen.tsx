"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, KeyRound, Loader2, Lock, Mail, Building2, User } from "lucide-react";
import { login, register, ApiError } from "@/lib/api";
import { useQueryClient as useRQClient } from "@tanstack/react-query";
import { useUI } from "@/lib/store";
import { Wordmark } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS = [
  { email: "admin@meridian.in", role: "Org Admin", name: "Priya Sharma" },
  { email: "ops@meridian.in", role: "Ops Manager", name: "Arjun Mehta" },
  { email: "dispatcher@meridian.in", role: "Dispatcher", name: "Kavya Reddy" },
  { email: "fleet@meridian.in", role: "Fleet Manager", name: "Rohit Patil" },
  { email: "analyst@meridian.in", role: "Analyst · read-only", name: "Neha Gupta" },
];

export default function AuthScreen() {
  const { authMode, setAuthMode, setSurface } = useUI();
  const router = useRouter();
  const queryClient = useRQClient();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ name: "", orgName: "", email: "", password: "" });
  const isSignIn = authMode === "signin";

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isSignIn && (form.name.trim().length < 2 || form.orgName.trim().length < 2)) {
      setError("Please enter your full name and organization name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Please enter a valid work email.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      if (isSignIn) {
        await login(form.email.trim(), form.password);
      } else {
        await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, orgName: form.orgName.trim() });
      }
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      router.refresh();
      setSurface("app");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setPending(false);
    }
  };

  const quickFill = (email: string) => {
    setForm((f) => ({ ...f, email, password: "Demo@12345" }));
    setError(null);
  };

  return (
    <div className="flex min-h-screen bg-paper">
      {/* Form panel */}
      <div className="relative flex w-full flex-col px-6 py-8 sm:px-12 lg:w-[46%] xl:px-20">
        <div className="flex items-center justify-between">
          <button onClick={() => setSurface("site")} className="group inline-flex items-center gap-1.5 text-xs font-medium text-ink-2 transition hover:text-ink" aria-label="Back to website">
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Back to site
          </button>
          <Wordmark />
        </div>

        <div className="flex flex-1 items-center">
          <div className="w-full max-w-md">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
              <p className="overline-label text-brand">{isSignIn ? "Freight Command Center" : "New workspace"}</p>
              <h1 className="font-display mt-3 text-4xl leading-[1.06] text-ink">
                {isSignIn ? (
                  <>Your fleet is <em className="text-brand">waiting</em>.</>
                ) : (
                  <>Put your logistics <em className="text-brand">on autopilot</em>.</>
                )}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">
                {isSignIn
                  ? "Sign in to the command center — live legs, delay radar and the AI recommendation queue."
                  : "Create your organization and we'll provision a labelled demo fleet so you can explore every workflow instantly."}
              </p>
            </motion.div>

            <motion.form
              onSubmit={submit}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="mt-7 space-y-4"
              noValidate
            >
              {!isSignIn && (
                <>
                  <Field label="Full name">
                    <Input id="name" aria-label="Full name" value={form.name} onChange={set("name")} placeholder="Aarav Kulkarni" autoComplete="name" className="h-11 border-input bg-card pl-9" />
                  </Field>
                  <Field label="Organization">
                    <Input id="orgName" aria-label="Organization" value={form.orgName} onChange={set("orgName")} placeholder="Deccan Freight Works" autoComplete="organization" className="h-11 border-input bg-card pl-9" />
                  </Field>
                </>
              )}
              <Field label="Work email">
                <Input id="email" type="email" aria-label="Work email" value={form.email} onChange={set("email")} placeholder="you@company.in" autoComplete="email" className="h-11 border-input bg-card pl-9" />
              </Field>
              <Field label="Password">
                <Input id="password" type="password" aria-label="Password" value={form.password} onChange={set("password")} placeholder={isSignIn ? "Your password" : "Minimum 8 characters"} autoComplete={isSignIn ? "current-password" : "new-password"} className="h-11 border-input bg-card pl-9" />
              </Field>

              {error && (
                <p role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2.5 text-xs font-medium text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={pending} className="h-11 w-full gap-2 rounded-lg bg-ink text-[13px] font-semibold text-paper hover:bg-brand">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {isSignIn ? "Sign in to command center" : "Create workspace"}
                {!pending && <ArrowRight className="h-3.5 w-3.5" />}
              </Button>

              <p className="text-center text-xs text-ink-2">
                {isSignIn ? (
                  <>
                    New to the platform?{" "}
                    <button type="button" onClick={() => { setAuthMode("signup"); setError(null); }} className="font-semibold text-brand underline-offset-2 hover:underline">
                      Create a workspace
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button type="button" onClick={() => { setAuthMode("signin"); setError(null); }} className="font-semibold text-brand underline-offset-2 hover:underline">
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </motion.form>

            {isSignIn && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="mt-8 rounded-xl border border-line bg-surface-2 p-4"
              >
                <p className="overline-label text-ink-2">Judge demo accounts</p>
                <p className="mt-1 text-[11px] text-ink-2">Password for all: <span className="font-mono font-semibold text-ink">Demo@12345</span> — click to autofill</p>
                <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.email}
                      type="button"
                      onClick={() => quickFill(a.email)}
                      className="group flex items-center justify-between rounded-lg border border-transparent bg-card px-2.5 py-2 text-left transition hover:border-line hover:shadow-sm"
                    >
                      <span>
                        <span className="block text-[11.5px] font-semibold text-ink">{a.role}</span>
                        <span className="block font-mono text-[10px] text-ink-2">{a.email}</span>
                      </span>
                      <ArrowRight className="h-3 w-3 text-ink-2 opacity-0 transition group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>

        <p className="text-[10.5px] text-ink-2">
          Protected workspace · org-isolated by design · demo dataset clearly labelled
        </p>
      </div>

      {/* Visual panel */}
      <div className="relative hidden overflow-hidden lg:block lg:w-[54%]">
        <Image src="/images/auth-truck.png" alt="Freight truck on an Indian expressway at dawn" fill priority className="object-cover" sizes="54vw" />
        <div className="absolute inset-0 bg-gradient-to-tr from-ink/85 via-ink/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12">
          <motion.blockquote
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6 }}
            className="max-w-lg"
          >
            <p className="font-display text-[26px] leading-snug text-white">
              &ldquo;The ops floor stopped chasing phone calls. The autopilot flags the four shipments that matter at 6am — we handle those and the day runs itself.&rdquo;
            </p>
            <footer className="mt-4 text-xs font-medium text-white/60">
              Operations Head · Meridian Freight Systems <span className="text-white/40">(demo persona)</span>
            </footer>
          </motion.blockquote>
          <div className="mt-8 flex flex-wrap gap-2">
            {[
              { k: "94.2%", v: "on-time" },
              { k: "38%", v: "empty-km cut" },
              { k: "₹8.4L", v: "saved / month" },
            ].map((s) => (
              <span key={s.v} className="glass rounded-full px-3 py-1.5 text-[11px] text-ink">
                <span className={cn("numeric font-semibold")}>{s.k}</span> <span className="text-ink-2">{s.v}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-ink">{label}</label>
      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2">
          {label === "Full name" ? <User className="h-4 w-4" /> : label === "Organization" ? <Building2 className="h-4 w-4" /> : label === "Work email" ? <Mail className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </div>
        {children}
      </div>
    </div>
  );
}
