import { cn } from "@/lib/utils";

/** Meridian-style route mark: a rounded square with an origin→destination arrow. */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8.5" fill="#182234" />
      <path
        d="M8 21.5c0-6 4-10 10-10h3"
        stroke="#F6F4EF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="0.1 5"
      />
      <path d="M18.6 8.4l3.6 3.1-3.6 3.1" stroke="#D4570E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.6" cy="21.8" r="2.5" fill="#D4570E" />
      <circle cx="23.4" cy="21.8" r="2.5" fill="#F6F4EF" />
    </svg>
  );
}

export function Wordmark({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={30} />
      <span className="leading-none">
        <span className={cn("block text-[15px] font-semibold tracking-tight", dark ? "text-white" : "text-ink")}>
          Logistics<span className="text-brand">Autopilot</span>
        </span>
        <span className={cn("overline-label mt-1 block text-[8.5px]", dark ? "text-white/50" : "text-ink-2/70")}>
          Freight Command Center
        </span>
      </span>
    </span>
  );
}
