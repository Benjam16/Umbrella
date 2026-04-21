import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin file tracing to the monorepo root so Next doesn't guess wrong about the
  // lockfile when deploying (Vercel root directory = platform/apps/web).
  outputFileTracingRoot: path.join(__dirname, "..", "..", ".."),
  // Transpile the shared runner package (exports raw TS via "exports" map).
  transpilePackages: ["@umbrella/runner"],
};

export default nextConfig;
