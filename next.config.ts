import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the tracing root to this project so `.next/standalone/server.js` is
  // always emitted at the top level — even when the app is unpacked inside a
  // parent directory that contains another lockfile (monorepo/workspace detection).
  outputFileTracingRoot: __dirname,
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
