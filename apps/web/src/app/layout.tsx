import type { Metadata } from "next";
import type React from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { env } from "@/env";
import { auth } from "@/lib/auth";
// oxlint-disable-next-line import/no-unassigned-import
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: env.CMDCLAW_EDITION === "selfhost" ? "CmdClaw Self-hosted" : "CmdClaw",
  description:
    env.CMDCLAW_EDITION === "selfhost"
      ? "Your self-hosted CmdClaw deployment"
      : "Your AI Assistant",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

function shouldUsePublicShell(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }

  return (
    pathname === "/login" ||
    pathname === "/invite-only" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/sign-in/")
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-cmdclaw-pathname");
  const publicShell = shouldUsePublicShell(pathname);
  const sessionData = publicShell
    ? null
    : await auth.api
        .getSession({
          headers: requestHeaders,
        })
        .catch(() => null);
  const hasSession = Boolean(sessionData?.session && sessionData?.user);
  const shouldUseMarketingShell = publicShell || (pathname === "/" && !hasSession);
  const Shell = shouldUseMarketingShell
    ? (await import("@/components/marketing-root-shell")).MarketingRootShell
    : (await import("@/components/app-root-shell")).AppRootShell;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        data-edition={env.CMDCLAW_EDITION}
      >
        <Shell hasSession={hasSession}>{children}</Shell>
      </body>
    </html>
  );
}
