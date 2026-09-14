"use client";

/* ————————————————————————————————————————————————————————————————————
   LandingPage — AI Logistics Autopilot (SIH 2026)
   Rendered by src/app/page.tsx with { onSignIn, onLaunchDemo }.
   ———————————————————————————————————————————————————————————————————— */

import { motion, useScroll, useSpring } from "framer-motion";
import {
  AiEngines,
  CtaSection,
  FaqSection,
  Hero,
  HowItWorks,
  Industries,
  MarqueeStrip,
  PlatformBento,
  ProofBand,
  SiteFooter,
  SiteNav,
  SihWhy,
  StatsBand,
} from "./sections";
import LiveTicker from "./landing-ticker";

export interface LandingPageProps {
  onSignIn: () => void;
  onLaunchDemo: () => void;
}

export default function LandingPage({ onSignIn, onLaunchDemo }: LandingPageProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink antialiased">
      <ScrollProgress />
      <SiteNav onSignIn={onSignIn} onLaunchDemo={onLaunchDemo} />
      <main className="flex-1">
        <Hero onLaunchDemo={onLaunchDemo} liveTicker={<LiveTicker />} />
        <MarqueeStrip />
        <StatsBand />
        <PlatformBento />
        <AiEngines />
        <HowItWorks />
        <Industries />
        <ProofBand />
        <SihWhy />
        <FaqSection />
        <CtaSection onLaunchDemo={onLaunchDemo} />
      </main>
      <SiteFooter />
    </div>
  );
}

/** Hairline scroll-progress beam pinned under the nav. */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 28, mass: 0.35 });
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-50 h-[2.5px] origin-left bg-gradient-to-r from-brand via-ai to-success"
    />
  );
}
