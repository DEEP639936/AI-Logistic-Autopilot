/**
 * Auto-start the Python FastAPI backend alongside the Next.js server.
 *
 * The FastAPI app owns every /api/* route; this hook boots it once when the
 * Next.js server starts so `npm run dev` (or `bun run dev`) brings up the
 * whole stack with a single command. Disable with AUTO_START_PY_BACKEND=0,
 * or run the backend yourself and point API_PROXY_URL at it (next.config.ts).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AUTO_START_PY_BACKEND === "0") return;
  const { startBackend } = await import("./instrumentation-node");
  await startBackend();
}
