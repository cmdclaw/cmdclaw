"use client";

import { usePathname } from "next/navigation";

export default function CoworkersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRunsRoute = pathname?.startsWith("/coworkers/runs");
  const isGridRoute = pathname === "/coworkers/grid";
  const isCoworkerEditorRoute =
    pathname?.startsWith("/coworkers/") &&
    pathname !== "/coworkers" &&
    !isRunsRoute &&
    !isGridRoute;

  return (
    <>
      {isRunsRoute || isCoworkerEditorRoute ? (
        <div className="bg-background flex h-full min-h-0 w-full flex-1 overflow-hidden">
          {children}
        </div>
      ) : (
        <div className="bg-background min-h-screen">
          <main className="mx-auto w-full max-w-[1400px] px-8 pt-10 pb-16">{children}</main>
        </div>
      )}
    </>
  );
}
