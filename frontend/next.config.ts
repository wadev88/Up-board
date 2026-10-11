import type { NextConfig } from "next";

// The repo root has its own package-lock.json; pin the project root to this
// folder so Turbopack and standalone output tracing don't pick the parent.
const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
  reactCompiler: true,
  poweredByHeader: false,
};

export default nextConfig;
