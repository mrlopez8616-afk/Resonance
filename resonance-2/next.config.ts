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
  async redirects() {
    return FIGHT_DESK_REDIRECTS.map((redirect) => ({ ...redirect }));
  },
};

export default nextConfig;
