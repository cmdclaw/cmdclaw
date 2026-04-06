import type { NextConfig } from "next";
import * as envConfig from "./src/env.js";

void envConfig;

const nextConfig: NextConfig = {
  /* config options here */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  reactCompiler: true,
  transpilePackages: ["@cmdclaw/core", "@cmdclaw/db"],
  typescript: {
    tsconfigPath: "./tsconfig.build.json",
  },
  images: {
    remotePatterns: [{ hostname: "lh3.googleusercontent.com" }, { hostname: "cdn.brandfetch.io" }],
  },
  serverExternalPackages: ["@whiskeysockets/baileys", "dockerode", "docker-modem", "ssh2"],
};

export default nextConfig;
