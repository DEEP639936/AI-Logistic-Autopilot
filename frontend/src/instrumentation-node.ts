/**
 * Node-only half of the instrumentation hook (FastAPI auto-start).
 * Imported conditionally from instrumentation.ts so the Edge runtime
 * bundle never touches Node built-ins.
 */
import { existsSync, openSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export async function startBackend(): Promise<void> {
  const port = process.env.PY_BACKEND_PORT ?? "8000";
  const healthUrl = `http://127.0.0.1:${port}/api/health`;

  // Already running? (started manually, or by the platform supervisor)
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(800) });
    if (res.ok) {
      console.log(`[instrumentation] FastAPI backend already healthy on :${port}`);
      return;
    }
  } catch {
    /* not running — spawn below */
  }

  const candidates = [
    process.env.PY_BACKEND_DIR,
    path.join(process.cwd(), "mini-services", "fastapi-backend"),
    path.join(process.cwd(), "backend"),
    path.join(process.cwd(), "..", "backend"),
  ].filter((p): p is string => !!p);

  const backendDir = candidates.find((p) => existsSync(path.join(p, "app", "main.py")));
  if (!backendDir) {
    console.warn(
      "[instrumentation] FastAPI backend not found (looked in mini-services/fastapi-backend, backend). " +
        `Start it manually: cd backend && python -m uvicorn app.main:app --port ${port}`,
    );
    return;
  }

  const logPath = path.join(backendDir, "server.log");
  const out = openSync(logPath, "a");
  const python = process.env.PYTHON_BIN ?? "python3";

  const child = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", port], {
    cwd: backendDir,
    stdio: ["ignore", out, out],
    env: process.env,
  });
  child.unref();

  console.log(
    `[instrumentation] FastAPI backend spawning from ${backendDir} on :${port} (pid ${child.pid}, log ${logPath})`,
  );
}
