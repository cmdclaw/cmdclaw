"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { MobileRecentDrawer } from "@/components/mobile-recent-drawer";

export default function CoworkersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [recentDrawerOpen, setRecentDrawerOpen] = useState(false);
  const openRecentDrawer = useCallback(() => {
    setRecentDrawerOpen(true);
  }, []);
  const isRunsRoute = pathname?.startsWith("/coworkers/runs");
  const isGridRoute = pathname === "/coworkers/grid";
  const isCoworkerEditorRoute =
    pathname?.startsWith("/coworkers/") &&
    pathname !== "/coworkers" &&
    !isRunsRoute &&
    !isGridRoute;

  return (
    <>
      {/* Mobile hamburger for recent runs */}
      <div className="flex h-12 items-center px-4 md:hidden">
        <button
          type="button"
          onClick={openRecentDrawer}
          className="text-muted-foreground hover:text-foreground -ml-1 flex h-8 w-8 items-center justify-center rounded-md"
          aria-label="Recent runs"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {isRunsRoute || isCoworkerEditorRoute ? (
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
