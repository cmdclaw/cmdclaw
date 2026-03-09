"use client";

import { usePathname } from "next/navigation";
import { AppShell, type SidebarVisibility } from "@/components/app-shell";

type AppShellRouteWrapperProps = {
  children: React.ReactNode;
  initialHasSession: boolean;
};

function getSidebarVisibility(pathname: string | null): SidebarVisibility | null {
  if (!pathname) {
    return null;
  }

  if (
    pathname === "/" ||
    pathname === "/template" ||
    pathname === "/templates" ||
    pathname.startsWith("/template/")
  ) {
    return "authenticated";
  }

  if (
    pathname.startsWith("/chat") ||
    pathname.startsWith("/coworkers") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/integrations") ||
    pathname.startsWith("/skills") ||
    pathname.startsWith("/toolbox") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/connect") ||
    pathname.startsWith("/search")
  ) {
    return "always";
  }

  return null;
}

export function AppShellRouteWrapper({ children, initialHasSession }: AppShellRouteWrapperProps) {
  const pathname = usePathname();
  const sidebarVisibility = getSidebarVisibility(pathname);

  if (!sidebarVisibility) {
    return children;
  }

  return (
    <AppShell sidebarVisibility={sidebarVisibility} initialHasSession={initialHasSession}>
      {children}
    </AppShell>
  );
}
