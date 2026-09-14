"use client";

/* ————————————————————————————————————————————————————————————————————
   Landing page sections — AI Logistics Autopilot (SIH 2026)
   Consumed only by ./LandingPage.tsx
   ———————————————————————————————————————————————————————————————————— */

import * as React from "react";
import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type Variants,
} from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  BellRing,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Code2,
  Eye,
  Factory,
  FileBarChart,
  Github,
  Linkedin,
  Loader2,
  Mail,
  Menu,
  PackageCheck,
  Quote,
  Radar,
  Repeat,
  Route,
  ShieldCheck,
  Timer,
  Truck,
  Twitter,
  Waypoints,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Wordmark } from "@/components/brand";
import { AnimatedNumber, DataStatusBadge, RiskBadge, SectionHead } from "@/components/primitives";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { submitDemoRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function scrollToId(id: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function AnchorLink({ id, className, children, onClick }: { id: string; className?: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <a
      href={`#${id}`}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        scrollToId(id);
        onClick?.();
      }}
    >
      {children}
    </a>
  );
}

/** whileInView fade-up, once, reduced-motion aware. */
function Reveal({ children, className, delay = 0, y = 26 }: { children: React.ReactNode; className?: string; delay?: number; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/** Warm editorial treatment for brand photography. */
function Photo({ src, alt, priority = false, overlay = "from-ink/45" }: { src: string; alt: string; priority?: boolean; overlay?: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-line">
      <Image src={src} alt={alt} fill priority={priority} sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
      <div className={cn("absolute inset-0 bg-gradient-to-t via-transparent to-transparent", overlay)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1) Sticky nav                                                       */
/* ------------------------------------------------------------------ */

const NAV_LINKS = [
  { label: "Platform", id: "platform" },
  { label: "AI Engines", id: "ai" },
  { label: "How it works", id: "how" },
  { label: "Industries", id: "industries" },
  { label: "FAQ", id: "faq" },
] as const;

export function SiteNav({ onSignIn, onLaunchDemo }: { onSignIn: () => void; onLaunchDemo: () => void }) {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="glass sticky top-0 z-40 border-b border-line">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <AnchorLink id="top" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" >
          <Wordmark />
        </AnchorLink>

        <nav aria-label="Primary" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 lg:flex">
          {NAV_LINKS.map((l) => (
            <AnchorLink
              key={l.id}
              id={l.id}
              className="text-sm font-medium text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-md px-1 py-0.5"
            >
              {l.label}
            </AnchorLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Button variant="ghost" className="text-ink hover:bg-muted" onClick={onSignIn}>
            Sign in
          </Button>
          <Button className="bg-ink text-paper hover:bg-brand" onClick={onLaunchDemo}>
            Launch live demo
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-card text-ink transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="mobile-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line bg-paper/95 backdrop-blur lg:hidden"
          >
            <nav aria-label="Mobile" className="space-y-1 px-4 py-4 sm:px-6">
              {NAV_LINKS.map((l) => (
                <AnchorLink
                  key={l.id}
                  id={l.id}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-[15px] font-medium text-ink transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {l.label}
                </AnchorLink>
              ))}
              <div className="flex gap-2 pt-3">
                <Button variant="outline" className="flex-1 border-line bg-card" onClick={() => { setOpen(false); onSignIn(); }}>
                  Sign in
                </Button>
                <Button className="flex-1 bg-ink text-paper hover:bg-brand" onClick={() => { setOpen(false); onLaunchDemo(); }}>
                  Launch live demo
                </Button>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* 3) Hero                                                             */
/* ------------------------------------------------------------------ */

const HERO_ITEM: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

/** Stylized India freight network — inline SVG, no app imports. */
function RouteNetworkSvg() {
  return (
    <svg viewBox="0 0 400 340" className="h-auto w-full" role="img" aria-label="Stylized route network across six Indian freight hubs">
      {/* faint connective tissue */}
      <path d="M 86 208 C 108 150 132 112 170 78" fill="none" stroke="rgba(24,34,52,0.16)" strokeWidth="1.4" />
      <path d="M 170 78 C 220 84 278 108 312 158" fill="none" stroke="rgba(24,34,52,0.16)" strokeWidth="1.4" />
      <path d="M 86 208 C 124 226 164 230 206 224" fill="none" stroke="rgba(24,34,52,0.16)" strokeWidth="1.4" />
      <path d="M 206 224 C 200 244 192 260 186 278" fill="none" stroke="rgba(24,34,52,0.16)" strokeWidth="1.4" />
      <path d="M 186 278 C 200 290 216 294 232 290" fill="none" stroke="rgba(24,34,52,0.16)" strokeWidth="1.4" />
      <path d="M 312 158 C 300 210 268 264 232 290" fill="none" stroke="rgba(24,34,52,0.16)" strokeWidth="1.4" />

      {/* active corridor (brand, flowing) */}
      <path
        d="M 86 208 C 108 150 132 112 170 78"
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="2"
        strokeLinecap="round"
        className="route-flow"
      />

      {/* hubs */}
      {(
        [
          { x: 170, y: 78, label: "Delhi", lx: 170, ly: 60, anchor: "middle", major: true },
          { x: 86, y: 208, label: "Mumbai", lx: 76, ly: 228, anchor: "middle", major: true },
          { x: 312, y: 158, label: "Kolkata", lx: 312, ly: 140, anchor: "middle", major: false },
          { x: 206, y: 224, label: "Hyderabad", lx: 220, ly: 220, anchor: "start", major: false },
          { x: 186, y: 278, label: "Bengaluru", lx: 170, ly: 298, anchor: "middle", major: false },
          { x: 232, y: 290, label: "Chennai", lx: 244, ly: 306, anchor: "start", major: false },
        ] as const
      ).map((n) => (
        <g key={n.label}>
          <circle cx={n.x} cy={n.y} r="6.5" fill="#ffffff" stroke="rgba(24,34,52,0.16)" strokeWidth="1.2" />
          <circle cx={n.x} cy={n.y} r="2.8" fill={n.major ? "var(--color-brand)" : "var(--color-ai)"} />
          <text x={n.lx} y={n.ly} textAnchor={n.anchor} fontSize="10" fill="#5c6a7e" className="numeric">
            {n.label}
          </text>
        </g>
      ))}

      {/* truck in motion */}
      <g>
        <circle cx="122" cy="134" r="9" fill="var(--color-brand)" opacity="0.25" className="pulse-ring" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
        <circle cx="122" cy="134" r="3.6" fill="var(--color-brand)" stroke="#ffffff" strokeWidth="1.4" />
      </g>
    </svg>
  );
}

function FloatingChip({
  className,
  delay,
  x,
  y,
  children,
}: {
  className?: string;
  delay: string;
  x?: MotionValue<number>;
  y?: MotionValue<number>;
  children: React.ReactNode;
}) {
  return (
    <motion.div className={cn("absolute z-10", className)} style={{ x, y }}>
      <div
        className="glass animate-floaty flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs shadow-[0_10px_28px_-14px_rgba(24,34,52,0.35)]"
        style={{ animationDelay: delay }}
      >
        {children}
      </div>
    </motion.div>
  );
}

function CommandPreviewCard() {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const spring = { stiffness: 140, damping: 20, mass: 0.6 };
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [5, -5]), spring);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-5, 5]), spring);
  const chip1x = useTransform(mx, [-0.5, 0.5], [10, -10]);
  const chip1y = useTransform(my, [-0.5, 0.5], [8, -8]);
  const chip2x = useTransform(mx, [-0.5, 0.5], [-12, 12]);
  const chip2y = useTransform(my, [-0.5, 0.5], [-8, 8]);
  const chip3x = useTransform(mx, [-0.5, 0.5], [8, -8]);
  const chip3y = useTransform(my, [-0.5, 0.5], [12, -12]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <div className="tilt-scene relative" onMouseMove={onMove} onMouseLeave={onLeave}>
      {/* decorative blobs */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-60 w-60 rounded-full bg-brand-soft opacity-70 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-14 -left-10 h-64 w-64 rounded-full bg-ai-soft opacity-70 blur-3xl" />

      <motion.div
        className="tilt-card grain relative overflow-hidden rounded-2xl border border-line bg-card shadow-[0_1px_2px_rgba(24,34,52,0.06),0_28px_70px_-28px_rgba(24,34,52,0.30)]"
        style={reduce ? undefined : { rotateX, rotateY }}
      >
        {/* window chrome */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-ink/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink/10" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink/10" />
            </div>
            <span className="overline-label text-ink-2">Meridian · Control</span>
          </div>
          <DataStatusBadge status="demo" />
        </div>

        {/* route map */}
        <div className="grid-blueprint relative bg-surface-2 px-2 pb-2 pt-3">
          <RouteNetworkSvg />
          <FloatingChip className="right-3 top-3" delay="0.6s" x={chip1x} y={chip1y}>
            <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden="true" />
            <span className="numeric font-medium text-ink">MH 12 AB 4321</span>
            <span className="text-ink-2">· +38 min risk</span>
          </FloatingChip>
          <FloatingChip className="left-3 top-[42%]" delay="1.7s" x={chip2x} y={chip2y}>
            <span className="h-1.5 w-1.5 rounded-full bg-ai" aria-hidden="true" />
            <span className="text-ink-2">Route re-ranked</span>
            <span className="numeric font-medium text-success">saved ₹4,200</span>
          </FloatingChip>
          <FloatingChip className="bottom-4 right-6" delay="2.9s" x={chip3x} y={chip3y}>
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            <span className="numeric font-medium text-ink">ETA 14:32</span>
            <span className="text-ink-2">· on-time</span>
          </FloatingChip>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
          {[
            { v: "128", l: "Active shipments" },
            { v: "94.2%", l: "On-time · 7d" },
            { v: "36.1%", l: "Fleet utilization" },
          ].map((k) => (
            <div key={k.l} className="px-2 py-3 text-center">
              <p className="numeric text-sm font-semibold text-ink">{k.v}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-2">{k.l}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export function Hero({ onLaunchDemo, liveTicker }: { onLaunchDemo: () => void; liveTicker?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } },
  };
  const item: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } }
    : HERO_ITEM;

  return (
    <section id="top" className="relative overflow-hidden pt-10 pb-20 sm:pt-14 lg:pt-16">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          {/* Left — editorial copy */}
          <motion.div variants={container} initial="hidden" animate="show">
            <motion.p variants={item} className="overline-label text-brand">
              Freight Operations · SIH 2026
            </motion.p>
            <motion.h1
              variants={item}
              className="font-display mt-5 text-5xl leading-[1.03] text-ink sm:text-6xl xl:text-7xl"
            >
              India&apos;s freight, on <em className="text-brand">autopilot</em>.
            </motion.h1>
            <motion.p variants={item} className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
              AI Logistics Autopilot plans routes, assigns vehicles, flags delays before they breach SLA and answers
              your ops floor — one command center for every kilometre your fleet runs.
            </motion.p>
            <motion.div variants={item} className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onLaunchDemo}
                className="group inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                Launch the live demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <AnchorLink
                id="platform"
                className="inline-flex items-center justify-center rounded-lg border border-line bg-card px-6 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink/20 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                Explore the platform
              </AnchorLink>
            </motion.div>
            <motion.div variants={item} className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="flex items-center gap-2">
                <DataStatusBadge status="rule_based" />
                <span className="text-xs text-ink-2">Explainable scoring</span>
              </span>
              <span className="flex items-center gap-2">
                <DataStatusBadge status="demo" />
                <span className="text-xs text-ink-2">Labelled demo data</span>
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                <span className="text-xs text-ink-2">Org-isolated by design</span>
              </span>
            </motion.div>
            {liveTicker && (
              <motion.div variants={item} className="mt-6 max-w-xl">
                {liveTicker}
              </motion.div>
            )}
          </motion.div>

          {/* Right — showpiece */}
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="lg:pl-2"
          >
            <CommandPreviewCard />
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 4) Marquee strip                                                    */
/* ------------------------------------------------------------------ */

const MARQUEE_NAMES = [
  "Meridian Freight Systems",
  "Kalinga Carriers",
  "Deccan Express",
  "Ganga Cargo Lines",
  "Sahyadri Logistics",
  "Coromandel Freight",
  "Vayu Parivahan",
] as const;

function MarqueeHalf({ hidden = false }: { hidden?: boolean }) {
  return (
    <div aria-hidden={hidden} className="flex w-max items-center">
      <span className="overline-label whitespace-nowrap px-6 text-brand">Trusted in demo by —</span>
      {MARQUEE_NAMES.map((n) => (
        <span key={n} className="numeric flex items-center whitespace-nowrap text-xs uppercase tracking-[0.16em] text-ink-2">
          <span className="px-5">{n}</span>
          <span className="text-brand/50">·</span>
        </span>
      ))}
    </div>
  );
}

export function MarqueeStrip() {
  return (
    <section className="overflow-hidden border-y border-line bg-surface-2 py-4" aria-label="Demo operators">
      <div className="animate-marquee flex w-max">
        <MarqueeHalf />
        <MarqueeHalf hidden />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 5) Stats band                                                       */
/* ------------------------------------------------------------------ */

const STATS = [
  { value: 38, label: "% fewer empty km", note: "vs. manual dispatch baseline", fmt: (n: number) => Math.round(n).toString() },
  { value: 2.4, label: "h faster dispatch", note: "draft plan ready before the morning call", fmt: (n: number) => n.toFixed(1) },
  { value: 8.4, label: "saved / month", note: "fuel, tolls and empty-km cost", fmt: (n: number) => `₹${n.toFixed(1)}L` },
  { value: 41, label: "t CO₂ cut / month", note: "fuller trucks, shorter detours", fmt: (n: number) => Math.round(n).toString() },
] as const;

export function StatsBand() {
  return (
    <section className="py-16">
      <Container>
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="overline-label text-brand">Simulated 90-day pilot</p>
              <DataStatusBadge status="demo" />
            </div>
            <p className="text-xs text-ink-2">Numbers from the labelled demo dataset — not customer data.</p>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.07}>
              <p className="numeric text-4xl text-ink">
                <AnimatedNumber value={s.value} format={s.fmt} />
              </p>
              <div aria-hidden="true" className="mt-4 h-px w-14 bg-gradient-to-r from-brand/80 via-brand/30 to-transparent" />
              <p className="mt-3 text-sm font-medium text-ink">{s.label}</p>
              <p className="mt-1 text-xs text-ink-2">{s.note}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 6) Platform bento                                                   */
/* ------------------------------------------------------------------ */

type Tone = "brand" | "ai" | "success" | "warn";
const TONE_CLS: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand",
  ai: "bg-ai-soft text-ai",
  success: "bg-success-soft text-success",
  warn: "bg-warn-soft text-warn",
};

function BentoCard({
  icon: Icon,
  tone,
  title,
  copy,
  children,
  className,
  delay = 0,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  copy: string;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className={className}>
      <div className="card-lift flex h-full flex-col rounded-2xl border border-line bg-card p-6">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", TONE_CLS[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="mt-4 font-semibold text-ink">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{copy}</p>
        <div className="mt-auto pt-5">
          <div className="border-t border-line pt-5">{children}</div>
        </div>
      </div>
    </Reveal>
  );
}

function MiniNetworkVisual() {
  return (
    <svg viewBox="0 0 320 96" className="h-auto w-full" aria-hidden="true">
      <path d="M 16 74 C 70 20 150 88 236 46 S 300 28 306 24" fill="none" stroke="rgba(24,34,52,0.14)" strokeWidth="1.4" />
      <path d="M 16 74 C 70 20 150 88 236 46" fill="none" stroke="var(--color-brand)" strokeWidth="1.8" strokeLinecap="round" className="route-flow" />
      {(
        [
          [16, 74],
          [236, 46],
          [306, 24],
        ] as const
      ).map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="5" fill="#fff" stroke="rgba(24,34,52,0.16)" strokeWidth="1.2" />
          <circle cx={x} cy={y} r="2.2" fill="var(--color-ai)" />
        </g>
      ))}
      <circle cx="126" cy="52" r="7" fill="var(--color-brand)" opacity="0.25" className="pulse-ring" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
      <circle cx="126" cy="52" r="3" fill="var(--color-brand)" stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}

function RouteIntelligenceVisual() {
  const rows = [
    { name: "NH48 · Mumbai–Bengaluru", pct: 92, cost: "₹18,420", best: true },
    { name: "NH48 + Pune bypass", pct: 78, cost: "₹19,860", best: false },
    { name: "SH via Solapur", pct: 61, cost: "₹21,240", best: false },
  ] as const;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className={cn("truncate", r.best ? "font-medium text-ink" : "text-ink-2")}>{r.name}</span>
            <span className="flex items-center gap-2">
              {r.best && <span className="rounded bg-ai-soft px-1.5 py-0.5 text-[10px] font-semibold text-ai">BEST</span>}
              <span className="numeric text-ink">{r.cost}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", r.best ? "bg-brand" : "bg-brand/45")} style={{ width: `${r.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SmartAssignmentVisual() {
  const chips = [
    { reg: "MH 12 AB 4321", type: "32ft SXL", score: 92, best: true },
    { reg: "GJ 01 KT 8802", type: "24ft Truck", score: 87, best: false },
    { reg: "KA 05 MN 1140", type: "Reefer 32ft", score: 81, best: false },
  ] as const;
  return (
    <div className="space-y-2">
      {chips.map((c) => (
        <div key={c.reg} className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2">
          <div>
            <p className="numeric text-xs font-medium text-ink">{c.reg}</p>
            <p className="text-[10px] text-ink-2">{c.type}</p>
          </div>
          <span className={cn("numeric rounded-md px-1.5 py-0.5 text-xs font-semibold", c.best ? "bg-brand-soft text-brand" : "bg-ai-soft text-ai")}>
            {c.score}
          </span>
        </div>
      ))}
    </div>
  );
}

function DelayRadarVisual() {
  return (
    <div className="flex flex-wrap gap-2">
      <RiskBadge band="low" score={14} />
      <RiskBadge band="medium" score={42} />
      <RiskBadge band="high" score={67} />
      <RiskBadge band="critical" score={88} />
    </div>
  );
}

function ConsolidationVisual() {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="numeric font-semibold text-ink">78% filled</span>
        <span className="numeric font-medium text-success">saves ₹6,900</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-brand to-brand-strong" />
      </div>
      <p className="mt-2 text-[11px] text-ink-2">4 loads grouped · Pune–Hyderabad corridor · departs 06:40</p>
    </div>
  );
}

function ReturnLoadVisual() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-ink">
          <span className="numeric">MH 12 AB 4321</span> → load <span className="numeric">APA-26-1188</span>
        </p>
        <p className="mt-0.5 text-[11px] text-ink-2">Pune → Nashik · 22 km detour · score 91</p>
      </div>
      <span className="numeric shrink-0 text-sm font-semibold text-success">+₹3,400</span>
    </div>
  );
}

export function PlatformBento() {
  return (
    <section id="platform" className="scroll-mt-20 py-24">
      <Container>
        <Reveal>
          <SectionHead
            overline="One command center"
            title={
              <>
                Every decision point, <em className="text-brand">one pane of glass</em>.
              </>
            }
            sub="Ten manual workflows — assignment, triage, re-routing, customer calls, reporting — collapsed into a single surface your team actually enjoys."
          />
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-12">
          <BentoCard
            icon={Waypoints}
            tone="brand"
            title="Command Center"
            copy="Live map, risk feed, recommendations and approvals — the whole operation on one screen, refreshed every 15 seconds."
            className="lg:col-span-7"
            delay={0}
          >
            <MiniNetworkVisual />
          </BentoCard>

          <BentoCard
            icon={Route}
            tone="ai"
            title="Route Intelligence"
            copy="Three costed alternatives per load with tolls, fuel, CO₂ and risk — the recommended route is the one you can defend."
            className="lg:col-span-5"
            delay={0.08}
          >
            <RouteIntelligenceVisual />
          </BentoCard>

          <BentoCard
            icon={Truck}
            tone="success"
            title="Smart Assignment"
            copy="Every pending load gets ranked vehicle suggestions with capacity fit, proximity and driver-hours reasons attached."
            className="lg:col-span-4"
            delay={0}
          >
            <SmartAssignmentVisual />
          </BentoCard>

          <BentoCard
            icon={Radar}
            tone="warn"
            title="Delay Radar"
            copy="At-risk shipments surface minutes after the ETA starts slipping — before the customer calls you."
            className="lg:col-span-4"
            delay={0.08}
          >
            <DelayRadarVisual />
          </BentoCard>

          <BentoCard
            icon={Boxes}
            tone="brand"
            title="Load Consolidation"
            copy="Same-corridor loads are grouped into fuller trucks inside your departure windows, with the savings stated up front."
            className="lg:col-span-4"
            delay={0.16}
          >
            <ConsolidationVisual />
          </BentoCard>

          <BentoCard
            icon={Repeat}
            tone="ai"
            title="Return-Load Matching"
            copy="Empty return legs are matched with paying backhauls nearby — detour-capped, profit-stated, one click to accept."
            className="md:col-span-2 lg:col-span-12"
            delay={0.1}
          >
            <ReturnLoadVisual />
          </BentoCard>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 7) AI engines                                                       */
/* ------------------------------------------------------------------ */

const ENGINES = [
  { n: "01", name: "Delay Risk", line: "Scores every in-transit shipment 0–100 from ETA slack, corridor weather and priority." },
  { n: "02", name: "Route Scoring", line: "Ranks alternative corridors on cost, tolls, fuel, CO₂ and risk — weights shown, not hidden." },
  { n: "03", name: "Vehicle Assignment", line: "Matches loads to vehicles on capacity fit, proximity, driver hours and cost." },
  { n: "04", name: "Load Consolidation", line: "Groups same-corridor shipments into fuller trucks inside departure windows." },
  { n: "05", name: "Return-Load Match", line: "Finds paying backhauls near your empty-return legs, detour-capped by policy." },
  { n: "06", name: "Predictive Maintenance", line: "Flags vehicles likely to miss service windows before they strand a load." },
  { n: "07", name: "Demand Forecast", line: "Projects lane-wise volume for the next 7 days from the labelled demo history." },
] as const;

export function AiEngines() {
  return (
    <section id="ai" className="scroll-mt-20 border-y border-line bg-surface-2 py-24">
      <Container>
        <Reveal>
          <SectionHead
            overline="Transparent by design"
            title={
              <>
                Seven engines. <em className="text-brand">Zero black boxes</em>.
              </>
            }
            sub="Every score ships with its reasons and the exact weights from your organization's threshold config — admins can tune them live."
          />
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ENGINES.map((e, i) => (
            <Reveal key={e.n} delay={(i % 4) * 0.06}>
              <div className="card-lift h-full rounded-xl border border-line bg-card p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="numeric text-xs text-ink-2/70">{e.n}</span>
                  <DataStatusBadge status="rule_based" />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold text-ink">{e.name}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{e.line}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <div className="mt-6 flex flex-col gap-5 rounded-2xl border border-line bg-card p-6 sm:flex-row sm:items-start">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ai-soft text-ai">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">Thresholds live in one versioned config</h3>
              <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-2">
                Every engine reads from your organization&apos;s threshold config. Admins tune weights and cut-offs live;
                each change is validated, versioned, hashed and audit-logged — and every output carries the config
                version it was computed with.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["delay_risk.high_min = 55", "route_scoring_weights Σ = 1.00", "auto_approve = off"].map((c) => (
                  <code key={c} className="numeric rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] text-ink-2">
                    {c}
                  </code>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 8) How it works                                                     */
/* ------------------------------------------------------------------ */

const STEPS = [
  {
    n: "01",
    title: "Connect your operation",
    copy: "Add your org, fleet, hubs and drivers in minutes. The demo ships with a fully-seeded operation, so you can explore every surface before connecting anything real.",
  },
  {
    n: "02",
    title: "Autopilot drafts the plan",
    copy: "Routes, assignments, consolidations and return-loads are drafted continuously — each suggestion ships with its reasons and the weights behind it.",
  },
  {
    n: "03",
    title: "Your team approves in one click",
    copy: "Approve, override or escalate. Every decision is audit-logged, thresholds are enforced, and the copilot stays on standby for the questions in between.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-24">
      <Container>
        <Reveal>
          <SectionHead
            overline="The loop"
            title={
              <>
                From raw fleet to <em className="text-brand">running plan</em> in three steps.
              </>
            }
          />
        </Reveal>
        <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="flex items-center gap-4">
                <span className="font-display text-6xl leading-none text-brand">{s.n}</span>
                <span aria-hidden="true" className="hidden h-px flex-1 bg-line md:block" />
              </div>
              <h3 className="mt-6 text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.copy}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 9) Industries (tabs)                                                */
/* ------------------------------------------------------------------ */

interface Industry {
  id: string;
  label: string;
  img: string;
  alt: string;
  tone: Tone;
  points: { icon: LucideIcon; stat: string; line: string }[];
}

const INDUSTRIES: Industry[] = [
  {
    id: "3pl",
    label: "3PL & Warehousing",
    img: "/images/warehouse.png",
    alt: "Warehouse dock with staged freight",
    tone: "brand",
    points: [
      { icon: Boxes, stat: "31% better vehicle fill", line: "Consolidation groups pack same-corridor loads into fewer, fuller trucks." },
      { icon: CalendarClock, stat: "Dock slots synced to ETA revisions", line: "Inbound delays reschedule dock slots automatically — no clipboard runs." },
      { icon: ClipboardCheck, stat: "SLA scorecards per client", line: "On-time %, cost/km and exceptions per client, generated automatically." },
    ],
  },
  {
    id: "fmcg",
    label: "FMCG Distribution",
    img: "/images/fleet-highway.png",
    alt: "Distribution trucks on a national highway",
    tone: "ai",
    points: [
      { icon: Timer, stat: "2.4 h faster dispatch", line: "Draft assignments are ready before the morning review call." },
      { icon: PackageCheck, stat: "98.2% primary fill on top lanes", line: "Demand forecast aligns fleet position with weekly volume." },
      { icon: Repeat, stat: "Fewer emergency hires", line: "Return-load matching turns empty legs into revenue." },
    ],
  },
  {
    id: "ecom",
    label: "E-commerce & Parcel",
    img: "/images/hero-port.png",
    alt: "Container port at dusk",
    tone: "brand",
    points: [
      { icon: BellRing, stat: "SLA breaches flagged pre-emptively", line: "Delay radar catches at-risk parcels 38 minutes earlier on average." },
      { icon: Eye, stat: "Milestone visibility for customers", line: "Every status call replaced by a tracked, auditable timeline." },
      { icon: FileBarChart, stat: "Nightly network report", line: "One report replaces the end-of-day spreadsheet ritual." },
    ],
  },
  {
    id: "mfg",
    label: "Manufacturing",
    img: "/images/control-room.png",
    alt: "Plant control room screens",
    tone: "success",
    points: [
      { icon: Factory, stat: "Zero missed production windows", line: "Inbound material ETAs tied to line-side schedule buffers." },
      { icon: BadgeCheck, stat: "Vendor compliance, auditable", line: "Every vendor pickup is scored, logged and reportable." },
      { icon: Wrench, stat: "Odometer-aware maintenance", line: "Service flags scheduled around plant shutdowns, not inside them." },
    ],
  },
];

export function Industries() {
  const [active, setActive] = React.useState(0);
  const tab = INDUSTRIES[active];
  const toneCls = TONE_CLS[tab.tone];

  return (
    <section id="industries" className="scroll-mt-20 py-24">
      <Container>
        <Reveal>
          <SectionHead
            overline="Who it's for"
            title={
              <>
                Built for the people who move <em className="text-brand">India</em>.
              </>
            }
          />
        </Reveal>

        <Reveal delay={0.08}>
          <div role="tablist" aria-label="Industries" className="mt-8 flex flex-wrap gap-2">
            {INDUSTRIES.map((t, i) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={i === active}
                aria-controls={`industry-panel-${t.id}`}
                id={`industry-tab-${t.id}`}
                onClick={() => setActive(i)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  i === active ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink-2 hover:border-ink/25 hover:text-ink"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="mt-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab.id}
              id={`industry-panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`industry-tab-${tab.id}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="grid items-center gap-10 md:grid-cols-2"
            >
              <div className="aspect-[4/3]">
                <Photo src={tab.img} alt={tab.alt} overlay="from-ink/40" />
              </div>
              <div>
                <ul className="space-y-6">
                  {tab.points.map((p) => (
                    <li key={p.stat} className="flex gap-4">
                      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneCls)}>
                        <p.icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-[15px] font-semibold text-ink">{p.stat}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{p.line}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 10) Proof band                                                      */
/* ------------------------------------------------------------------ */

const PROOF_METRICS = [
  { v: "38%", l: "fewer empty km" },
  { v: "94.2%", l: "on-time rate" },
  { v: "₹8.4L", l: "saved / month" },
] as const;

export function ProofBand() {
  return (
    <section className="relative overflow-hidden bg-ink py-24 text-paper">
      <div aria-hidden="true" className="absolute inset-y-0 right-0 w-full md:w-[58%]">
        <Image src="/images/control-room.png" alt="" fill sizes="60vw" className="object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-ink/20" />
      </div>
      <Container className="relative">
        <Reveal>
          <p className="overline-label text-brand">Field note — demo persona</p>
          <figure className="mt-8 max-w-3xl">
            <Quote className="h-7 w-7 text-brand/70" aria-hidden="true" />
            <blockquote className="font-display mt-5 text-2xl leading-snug text-paper sm:text-3xl lg:text-4xl">
              “The ops floor stopped chasing phone calls. The autopilot flags the four shipments that matter at 6am —
              we handle those and the day runs itself.”
            </blockquote>
            <figcaption className="mt-6 text-sm text-paper/60">
              — Operations Head, Meridian Freight Systems <span className="text-paper/40">(demo persona)</span>
            </figcaption>
          </figure>
          <div className="mt-10 flex flex-wrap gap-3">
            {PROOF_METRICS.map((m) => (
              <div key={m.l} className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5">
                <p className="numeric text-lg font-semibold text-paper">{m.v}</p>
                <p className="text-xs text-paper/60">{m.l}</p>
              </div>
            ))}
            <div className="flex items-center">
              <DataStatusBadge status="demo" />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 11) SIH / why                                                       */
/* ------------------------------------------------------------------ */

const WORKFLOWS = [
  "Shipment–vehicle assignment",
  "Route selection",
  "Delay triage",
  "Disruption response",
  "Consolidation planning",
  "Empty-return sourcing",
  "Customer status calls",
  "Document chasing",
  "Reporting",
] as const;

export function SihWhy() {
  return (
    <section id="proof" className="scroll-mt-20 py-24">
      <Container>
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <Reveal>
            <SectionHead
              overline="Smart India Hackathon 2026"
              title={
                <>
                  Logistics is 13% of India&apos;s GDP. <em className="text-brand">Most of it runs on phone calls</em>.
                </>
              }
            />
            <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink-2">
              <p>
                Assignment happens on a whiteboard. Triage happens on a phone. Reporting happens in a spreadsheet, at
                night. The result: trucks that run empty in one direction while loads wait in the other, and ops teams
                that spend their day chasing status instead of improving it.
              </p>
              <p>
                AI Logistics Autopilot compresses that stack into one approval-driven loop. Engines draft; your team
                decides. Every output is explainable, labelled and auditable — which is exactly what a national
                freight backbone needs.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="card-lift rounded-2xl border border-line bg-card p-6 sm:p-8">
              <h3 className="font-semibold text-ink">Nine workflows, one loop</h3>
              <p className="mt-1 text-xs text-ink-2">
                From the product definition — each is drafted by an engine and approved by a human.
              </p>
              <ul className="mt-6 space-y-3.5">
                {WORKFLOWS.map((w) => (
                  <li key={w} className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span className="text-sm font-medium text-ink">{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 12) FAQ                                                             */
/* ------------------------------------------------------------------ */

const FAQS = [
  {
    q: "Is the data real?",
    a: "No — and it is labelled as such everywhere. The platform runs on a fully-labelled demo dataset (marked demo on every screen), so you can exercise every workflow honestly. Connect real telemetry and the same engines run on your data.",
  },
  {
    q: "What AI powers it?",
    a: "Transparent, rule-based engines — delay risk, route scoring, assignment, consolidation, return-loads, maintenance and forecast — plus an LLM copilot when configured. Every output carries a dataStatus label: rule_based, demo or optimization. Nothing is a black box.",
  },
  {
    q: "Can it tune to our policies?",
    a: "Yes. Admins edit a single versioned threshold config — weights, cut-offs and auto-approve switches — and every engine picks it up immediately. Changes are validated, versioned and audit-logged.",
  },
  {
    q: "Does it need GPS hardware?",
    a: "Not to evaluate. The demo runs on simulated telemetry; the schema is telemetry-ready, so GPS feeds drop straight into the same ingestion shape later.",
  },
  {
    q: "How was it built?",
    a: "Next.js 16 (App Router), TypeScript, Tailwind and Framer Motion on the front; a typed API layer over Prisma with a PostgreSQL-ready schema. The AI engines are pure, testable TypeScript driven by the threshold config.",
  },
] as const;

export function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-20 py-24">
      <Container>
        <Reveal>
          <SectionHead
            overline="FAQ"
            title={
              <>
                Fair questions, <em className="text-brand">straight answers</em>.
              </>
            }
            align="center"
          />
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-line bg-card px-5 sm:px-8">
            <Accordion type="single" collapsible>
              {FAQS.map((f) => (
                <AccordionItem key={f.q} value={f.q}>
                  <AccordionTrigger className="text-[15px] font-semibold text-ink hover:no-underline">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-ink-2">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 13) CTA + request-demo form                                         */
/* ------------------------------------------------------------------ */

const demoSchema = z.object({
  name: z.string().min(2, "Please enter your name"),
  email: z.email("Enter a valid work email"),
  organization: z.string().min(2, "Organization is required"),
  fleetSize: z.enum(["1-10", "11-50", "51-200", "200+"], { message: "Select a fleet size" }),
  message: z.string().max(600, "Keep it under 600 characters").optional(),
});

type DemoFormValues = z.infer<typeof demoSchema>;

const FLEET_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;

const inputCls =
  "h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm text-ink outline-none transition placeholder:text-ink-2/50 focus-visible:ring-2 focus-visible:ring-ring/40";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-danger">{msg}</p>;
}

function RequestDemoForm() {
  const [status, setStatus] = React.useState<"idle" | "success" | "error">("idle");
  const [serverError, setServerError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DemoFormValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: { name: "", email: "", organization: "", message: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await submitDemoRequest({
        name: values.name,
        email: values.email,
        org: values.organization,
        fleetSize: values.fleetSize,
        message: values.message ?? "",
      });
      setStatus("success");
      reset();
    } catch (e) {
      setStatus("error");
      setServerError(e instanceof Error ? e.message : "Request failed. Please try again.");
    }
  });

  if (status === "success") {
    return (
      <motion.div
        key="success"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex h-full flex-col items-start justify-center"
      >
        <CheckCircle2 className="h-10 w-10 text-success" />
        <h3 className="mt-4 font-display text-2xl text-ink">Request logged.</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          We&apos;ll reach out within one working day. Meanwhile, the live demo is open with the credentials on the
          left.
        </p>
        <p className="mt-3 text-xs text-ink-2/80">Demo environment: this request is stored in the local demo database, not sent to a real inbox.</p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Submit another request
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h3 className="font-semibold text-ink">Request a walkthrough</h3>
      <p className="mt-1 text-xs text-ink-2">Tell us where to reach you — no spam, one email.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rd-name" className="mb-1.5 block text-xs font-medium text-ink">
            Name
          </label>
          <input id="rd-name" type="text" autoComplete="name" placeholder="Priya Sharma" className={inputCls} {...register("name")} />
          <FieldError msg={errors.name?.message} />
        </div>
        <div>
          <label htmlFor="rd-email" className="mb-1.5 block text-xs font-medium text-ink">
            Work email
          </label>
          <input id="rd-email" type="email" autoComplete="email" placeholder="ops@yourfleet.in" className={inputCls} {...register("email")} />
          <FieldError msg={errors.email?.message} />
        </div>
        <div>
          <label htmlFor="rd-org" className="mb-1.5 block text-xs font-medium text-ink">
            Organization
          </label>
          <input id="rd-org" type="text" autoComplete="organization" placeholder="Meridian Freight Systems" className={inputCls} {...register("organization")} />
          <FieldError msg={errors.organization?.message} />
        </div>
        <div>
          <label htmlFor="rd-fleet" className="mb-1.5 block text-xs font-medium text-ink">
            Fleet size
          </label>
          <div className="relative">
            <select id="rd-fleet" className={cn(inputCls, "appearance-none pr-9", "bg-paper")} defaultValue="" {...register("fleetSize")}>
              <option value="" disabled>
                Select fleet size
              </option>
              {FLEET_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("-", "–")} vehicles
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2" aria-hidden="true" />
          </div>
          <FieldError msg={errors.fleetSize?.message} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="rd-msg" className="mb-1.5 block text-xs font-medium text-ink">
            Message <span className="font-normal text-ink-2">(optional)</span>
          </label>
          <textarea
            id="rd-msg"
            rows={3}
            placeholder="Corridors you run, what you'd like to see…"
            className={cn(inputCls, "h-auto resize-none py-2.5")}
            {...register("message")}
          />
          <FieldError msg={errors.message?.message} />
        </div>
      </div>

      {status === "error" && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft/60 px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs leading-relaxed text-danger">
            {serverError ?? "Something went wrong."} Your inputs are still here — press “Try again”.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {isSubmitting ? "Logging request…" : status === "error" ? "Try again" : "Request demo"}
      </button>
      <p className="mt-3 text-center text-[11px] text-ink-2/80">Demo environment: stored locally in this instance.</p>
    </form>
  );
}

export function CtaSection({ onLaunchDemo }: { onLaunchDemo: () => void }) {
  return (
    <section className="py-24">
      <Container>
        <Reveal>
          <div className="grid overflow-hidden rounded-3xl bg-ink md:grid-cols-2">
            <div className="flex flex-col justify-center p-8 sm:p-10 lg:p-14">
              <p className="overline-label text-brand">Ready when you are</p>
              <h2 className="font-display mt-4 text-3xl leading-tight text-paper sm:text-4xl">
                See your fleet on <em className="text-brand">autopilot</em>.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-paper/70">
                Sign in with the demo credentials and explore the full command center — 160 shipments, 32 vehicles,
                live disruptions, honest labels. Or leave your details and we&apos;ll set up a walkthrough for your
                operation.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-2">
                <span className="text-xs text-paper/50">Demo credentials</span>
                <code className="numeric rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-paper/85">
                  admin@meridian.in
                </code>
                <code className="numeric rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-paper/85">
                  Demo@12345
                </code>
              </div>
              <div className="mt-7">
                <button
                  type="button"
                  onClick={onLaunchDemo}
                  className="group inline-flex items-center gap-2 rounded-lg border border-white/20 px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                >
                  Launch live demo
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <div className="h-full rounded-2xl bg-card p-6 sm:p-8">
                <RequestDemoForm />
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 14) Footer                                                          */
/* ------------------------------------------------------------------ */

function FooterHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="overline-label text-paper/40">{children}</h3>;
}

function FooterLink({ href, external = false, onClick, children }: { href: string; external?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <a
      href={href}
      onClick={onClick}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className="block py-1.5 text-sm text-paper/70 transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
    >
      {children}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
          <div>
            <Wordmark dark />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-paper/60">
              One command center for every kilometre your fleet runs. Built for Smart India Hackathon 2026.
            </p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-success">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
              All systems nominal (demo)
            </p>
          </div>

          <nav aria-label="Platform">
            <FooterHeading>Platform</FooterHeading>
            <div className="mt-4">
              {NAV_LINKS.map((l) => (
                <FooterLink key={l.id} href={`#${l.id}`} onClick={() => scrollToId(l.id)}>
                  {l.label}
                </FooterLink>
              ))}
            </div>
          </nav>

          <nav aria-label="Resources">
            <FooterHeading>Resources</FooterHeading>
            <div className="mt-4">
              <FooterLink href="mailto:hello@logisticsautopilot.in?subject=Demo%20script%20request">Demo script</FooterLink>
              <FooterLink href="https://github.com/logistics-autopilot" external>
                Architecture
              </FooterLink>
              <FooterLink href="https://github.com/logistics-autopilot#api-overview" external>
                API overview
              </FooterLink>
              <FooterLink href="https://sih.gov.in" external>
                SIH problem statement
              </FooterLink>
            </div>
          </nav>

          <nav aria-label="Contact">
            <FooterHeading>Contact</FooterHeading>
            <div className="mt-4">
              <FooterLink href="mailto:hello@logisticsautopilot.in">
                <span className="inline-flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5" /> hello@logisticsautopilot.in
                </span>
              </FooterLink>
              <FooterLink href="https://github.com/logistics-autopilot" external>
                <span className="inline-flex items-center gap-2">
                  <Github className="h-3.5 w-3.5" /> GitHub
                </span>
              </FooterLink>
              <FooterLink href="https://x.com/logisticsap" external>
                <span className="inline-flex items-center gap-2">
                  <Twitter className="h-3.5 w-3.5" /> Twitter / X
                </span>
              </FooterLink>
              <FooterLink href="https://www.linkedin.com/company/logistics-autopilot" external>
                <span className="inline-flex items-center gap-2">
                  <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                </span>
              </FooterLink>
            </div>
          </nav>
        </div>
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex flex-wrap items-center justify-between gap-2 py-6 text-xs text-paper/50">
          <p>© 2026 Logistics Autopilot — Built for Smart India Hackathon 2026 · Demo dataset, not customer data</p>
          <p className="numeric tracking-wider">Made in India</p>
        </Container>
      </div>
    </footer>
  );
}
