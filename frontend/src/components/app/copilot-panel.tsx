"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Bot, Database, Sparkles, X } from "lucide-react";
import { useCopilot } from "@/lib/api";
import { useUI } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  dataStatus?: string;
  sources?: string[];
}

const SUGGESTIONS = [
  "Which shipments should I worry about today?",
  "Summarize fleet readiness",
  "What can I consolidate this week?",
  "Any maintenance risks building up?",
];

export function CopilotDock() {
  const open = useUI((s) => s.copilotOpen);
  const setOpen = useUI((s) => s.setCopilotOpen);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<Msg[]>([
    {
      role: "assistant",
      content:
        "I'm your logistics copilot. I can see your organization's shipments, fleet and live risks — ask me anything, or start with a suggestion below. I never see data outside your org.",
    },
  ]);
  const copilot = useCopilot();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, copilot.isPending]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || copilot.isPending) return;
    setInput("");
    const history = messages
      .filter((m) => m !== messages[0])
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    copilot.mutate(
      { message, history },
      {
        onSuccess: (res) =>
          setMessages((prev) => [...prev, { role: "assistant", content: res.reply, dataStatus: res.dataStatus, sources: res.sources }]),
        onError: (e) =>
          setMessages((prev) => [...prev, { role: "assistant", content: `I hit an error answering that: ${e.message}. Try again in a moment.` }]),
      }
    );
  };

  return (
    <>
      {/* Launcher */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 18 }}
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close copilot" : "Open logistics copilot"}
        className={cn(
          "glow-pulse fixed bottom-5 right-5 z-50 flex h-13 w-13 items-center justify-center rounded-full bg-ink p-3.5 text-paper shadow-xl transition-colors hover:bg-brand",
          open && "hidden",
        )}
      >
        <Sparkles className="h-5 w-5" />
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
          <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-paper bg-brand" />
        </span>
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-label="Logistics copilot"
            className="fixed bottom-5 right-5 z-50 flex h-[560px] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl"
          >
            <header className="flex items-center gap-2.5 border-b border-line bg-surface-2 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-ink">Logistics Copilot</p>
                <p className="flex items-center gap-1 text-[10.5px] text-ink-2">
                  <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-success" />
                  Org-scoped · answers cite your data
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close copilot">
                <X className="h-4 w-4" />
              </Button>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-slim">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed",
                      m.role === "user"
                        ? "rounded-br-sm bg-ink text-paper"
                        : "rounded-bl-sm border border-line bg-surface-2 text-ink",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.dataStatus && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                            m.dataStatus === "live" ? "bg-success-soft text-success" : "bg-ai-soft text-ai",
                          )}
                        >
                          <Database className="h-2.5 w-2.5" />
                          {m.dataStatus === "live" ? "LLM + your data" : "deterministic fallback"}
                        </span>
                        {m.sources?.map((s) => (
                          <span key={s} className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-ink-2">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {copilot.isPending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-line bg-surface-2 px-4 py-3">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-2/60" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {messages.length <= 1 && (
              <div className="flex flex-wrap gap-1.5 px-4 pb-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-2 transition hover:border-ai/40 hover:text-ai"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 border-t border-line p-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about shipments, fleet, risks…"
                aria-label="Message the copilot"
                className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-[13px] text-ink outline-none placeholder:text-ink-2/60 focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <Button type="submit" size="icon" className="h-10 w-10 shrink-0 bg-ink text-paper hover:bg-brand" disabled={copilot.isPending || !input.trim()} aria-label="Send">
                <ArrowUp className="h-4 w-4" />
              </Button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
