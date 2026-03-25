import type { Metadata } from "next";
import type React from "react";
import { AutumnProvider } from "autumn-js/react";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { AppShellRouteWrapper } from "@/components/app-shell-route-wrapper";
import { DesktopNotificationPermissionGate } from "@/components/desktop-notification-permission-gate";
import { PostHogClientProvider } from "@/components/posthog-provider";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/env";
import { auth } from "@/lib/auth";
import { ORPCProvider } from "@/orpc/provider";
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

const isSelfHostedEdition = env.CMDCLAW_EDITION === "selfhost";

function BillingProviderWrapper({ children }: { children: React.ReactNode }) {
  if (isSelfHostedEdition) {
    return children;
  }

  return (
    <AutumnProvider betterAuthUrl={env.APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? ""}>
      {children}
    </AutumnProvider>
  );
}

export const metadata: Metadata = {
  title: isSelfHostedEdition ? "CmdClaw Self-hosted" : "CmdClaw",
  description: isSelfHostedEdition ? "Your self-hosted CmdClaw deployment" : "Your AI Assistant",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const sessionData = await auth.api.getSession({
    headers: requestHeaders,
  });
  const hasSession = Boolean(sessionData?.session && sessionData?.user);

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        data-edition={env.CMDCLAW_EDITION}
      >
        <PostHogClientProvider>
          <ORPCProvider>
            <BillingProviderWrapper>
              <DesktopNotificationPermissionGate enabled={hasSession} />
              <AppShellRouteWrapper initialHasSession={hasSession}>{children}</AppShellRouteWrapper>
              <Toaster />
            </BillingProviderWrapper>
          </ORPCProvider>
        </PostHogClientProvider>
      </body>
    </html>
  );
}
