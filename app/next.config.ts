import type { NextConfig } from "next";
import * as envConfig from "./src/env.js";

void envConfig;

const posthogApiDestination = "https://eu.i.posthog.com";
const posthogAssetsDestination = "https://eu-assets.i.posthog.com";
const posthogProxyPath = "/_cmdclaw_lattice";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [{ hostname: "lh3.googleusercontent.com" }],
  },
  serverExternalPackages: ["@whiskeysockets/baileys", "dockerode", "docker-modem", "ssh2"],
  async rewrites() {
    return [
      {
        source: `${posthogProxyPath}/static/:path*`,
        destination: `${posthogAssetsDestination}/static/:path*`,
      },
      {
        source: `${posthogProxyPath}/:path*`,
        destination: `${posthogApiDestination}/:path*`,
      },
    ];
  },
};

export default nextConfig;
