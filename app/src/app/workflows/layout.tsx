"use client";

import { usePathname } from "next/navigation";

export default function WorkflowsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRunsRoute = pathname?.startsWith("/workflows/runs");
  const isGridRoute = pathname === "/workflows/grid";
  const isWorkflowEditorRoute =
    pathname?.startsWith("/workflows/") &&
    pathname !== "/workflows" &&
    !isRunsRoute &&
    !isGridRoute;

  return (
    <>
      {isRunsRoute || isWorkflowEditorRoute ? (
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
