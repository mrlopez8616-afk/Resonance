import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@hashgraph/sdk",
    "xrpl",
    "ripple-keypairs",
    "ripple-binary-codec",
  ],
};

export default nextConfig;
