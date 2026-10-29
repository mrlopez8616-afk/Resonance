import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { FIGHT_DESK_REDIRECTS } from "./src/lib/fight-desk-redirects";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Keep this app isolated from the Phase Zero dashboard at the repo root.
  // Next.js otherwise picks the parent lockfile and compiles root src/proxy.ts.
  turbopack: {
    root: appRoot,
  },
  outputFileTracingRoot: appRoot,
  experimental: {
    // Shortcuts ingest buffer. Health Auto Export stays under Vercel's ~4.5 MB
    // function body cap and uses the app's batch requests for a full-history export.
    proxyClientMaxBodySize: "32mb",
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      ...FIGHT_DESK_REDIRECTS.map((redirect) => ({ ...redirect })),
      {
        source: "/n/fitness/activity",
        destination: "/n/fitness/steps",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
