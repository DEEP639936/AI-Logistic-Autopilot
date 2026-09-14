import type { NextConfig } from "next";

/**
 * The FastAPI backend (Python) owns every /api/* route.
 * The Next.js app is the UI + a transparent reverse proxy in front of it:
 *   - sandbox / local dev: backend auto-spawned on :8000 (see src/instrumentation.ts)
 *   - production: run uvicorn separately and point API_PROXY_URL at it
 */
const BACKEND_URL = process.env.API_PROXY_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
