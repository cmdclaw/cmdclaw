"use client";

import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileBottomBar } from "@/components/mobile-bottom-bar";
import { authClient } from "@/lib/auth-client";

const APP_SHELL_CONTENT_STYLE: React.CSSProperties = { transform: "translateZ(0)" };

export type SidebarVisibility = "always" | "authenticated" | "never";

type AppShellProps = {
  children: React.ReactNode;
  sidebarVisibility?: SidebarVisibility;
  initialHasSession?: boolean;
};

export function AppShell({
  children,
  sidebarVisibility = "always",
  initialHasSession = false,
}: AppShellProps) {
  const [showAuthenticatedSidebar, setShowAuthenticatedSidebar] = useState(initialHasSession);

  useEffect(() => {
    if (sidebarVisibility === "always") {
      setShowAuthenticatedSidebar(true);
      return;
    }

    if (sidebarVisibility !== "authenticated") {
      setShowAuthenticatedSidebar(false);
      return;
    }

    let mounted = true;

    authClient
      .getSession()
      .then((result) => {
        if (!mounted) {
          return;
        }

        setShowAuthenticatedSidebar(Boolean(result?.data?.session && result?.data?.user));
      })
      .catch(() => {
        if (mounted) {
          setShowAuthenticatedSidebar(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [sidebarVisibility]);

  const showNav =
    sidebarVisibility === "always" ||
    (sidebarVisibility === "authenticated" && showAuthenticatedSidebar);

  return (
    <div className="flex h-screen w-full">
      {showNav ? <AppSidebar /> : null}
      <div
        className="app-shell-scroll-container relative h-full min-w-0 flex-1 overflow-auto pb-16 md:pb-0"
        style={APP_SHELL_CONTENT_STYLE}
      >
        {children}
      </div>
      {showNav ? <MobileBottomBar /> : null}
    </div>
  );
}
