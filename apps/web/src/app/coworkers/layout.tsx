"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MobileRecentDrawer } from "@/components/mobile-recent-drawer";
import { COWORKERS_OPEN_RECENT_DRAWER_EVENT } from "@/lib/coworkers-events";

export default function CoworkersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [recentDrawerOpen, setRecentDrawerOpen] = useState(false);
  const isRunsRoute = pathname?.startsWith("/coworkers/runs");
  const isGridRoute = pathname === "/coworkers/grid";
  const isDeployRoute = pathname?.startsWith("/coworkers/deploy/");
  const isOverviewRoute = pathname === "/coworkers/overview";
  const isHistoryRoute = pathname === "/coworkers/history";
  const isUsageRoute = pathname === "/coworkers/usage";
  const isOrgChartRoute = pathname === "/coworkers/org-chart";
  const isCoworkerEditorRoute =
    pathname?.startsWith("/coworkers/") &&
    pathname !== "/coworkers" &&
    !isDeployRoute &&
    !isRunsRoute &&
    !isGridRoute &&
    !isOverviewRoute &&
    !isHistoryRoute &&
    !isUsageRoute &&
    !isOrgChartRoute;

  useEffect(() => {
    const handleOpenDrawer = () => setRecentDrawerOpen(true);
    window.addEventListener(COWORKERS_OPEN_RECENT_DRAWER_EVENT, handleOpenDrawer);
    return () => window.removeEventListener(COWORKERS_OPEN_RECENT_DRAWER_EVENT, handleOpenDrawer);
  }, []);

  return (
    <>
      {isRunsRoute || isOrgChartRoute ? (
        children
      ) : isCoworkerEditorRoute ? (
        <div className="bg-background flex h-full min-h-0 w-full flex-1 overflow-hidden">
          {children}
        </div>
      ) : (
        <div className="bg-background min-h-screen">
          <main className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-16 md:px-8 md:pt-10">
            {children}
          </main>
        </div>
      )}

      <MobileRecentDrawer
        open={recentDrawerOpen}
        onOpenChange={setRecentDrawerOpen}
        mode="coworkers"
      />
    </>
  );
}
