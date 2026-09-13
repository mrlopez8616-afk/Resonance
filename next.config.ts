import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@hashgraph/sdk", "xrpl"],
};

export default nextConfig;
