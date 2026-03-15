import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase proxy timeout for long-running backtests (1 hour)
  serverExternalPackages: [],
  experimental: {
    proxyTimeout: 3_600_000,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
      {
        source: "/ws/:path*",
        destination: "http://localhost:8000/ws/:path*",
      },
    ];
  },
};

export default nextConfig;
