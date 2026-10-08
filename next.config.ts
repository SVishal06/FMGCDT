import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module: must be loaded from node_modules at runtime, not bundled.
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
};

export default nextConfig;
