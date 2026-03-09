import type { Metadata } from "next";
import { AutumnProvider } from "autumn-js/react";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { AppShellRouteWrapper } from "@/components/app-shell-route-wrapper";
import { DesktopNotificationPermissionGate } from "@/components/desktop-notification-permission-gate";
import { PostHogClientProvider } from "@/components/posthog-provider";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/env";
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

export const metadata: Metadata = {
  title: "CmdClaw",
  description: "Your AI Assistant",
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
  const cookieStore = await cookies();
  const hasSessionCookie =
    cookieStore.has("__Secure-better-auth.session_token") ||
    cookieStore.has("better-auth.session_token");

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PostHogClientProvider>
          <ORPCProvider>
            <AutumnProvider betterAuthUrl={env.APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? ""}>
              <DesktopNotificationPermissionGate />
              <AppShellRouteWrapper initialHasSession={hasSessionCookie}>
                {children}
              </AppShellRouteWrapper>
              <Toaster />
            </AutumnProvider>
          </ORPCProvider>
        </PostHogClientProvider>
      </body>
    </html>
  );
}
