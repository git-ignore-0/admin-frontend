import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Next.js traces the dev-only imports even though these routes return notFound in production.
  outputFileTracingExcludes: {
    "/dev/ui-foundation{,/**}": ["./components/ui-foundation-showcase/**/*"],
  },
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
  },
  // Keep recently visited admin routes compiled while switching between modules.
  // This only retains development code, not authenticated responses or user data.
  onDemandEntries: {
    maxInactiveAge: 5 * 60 * 1000,
    pagesBufferLength: 12,
  },
};

export default nextConfig;
