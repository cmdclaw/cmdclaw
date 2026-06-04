import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthenticatedAppRootShell } from "@/components/authenticated-app-root-shell";
import { MobileRecentDrawer } from "@/components/mobile-recent-drawer";
import { COWORKERS_OPEN_RECENT_DRAWER_EVENT } from "@/lib/coworkers-events";
import { requireSession } from "@/lib/route-guards";
import CoworkersPage from "./-components/coworkers-page";

/**
 * Agents shell layout (was src/app/agents/layout.tsx).
 *
 * Protected access lives in `beforeLoad`: an unauthenticated request is redirected to
 * /login (or worktree auto-login) with a callbackUrl back to the originally requested path.
 *
 * The shell still selects its outer chrome from the current pathname, but that is now a
 * presentational concern reading TanStack Router location rather than a global pathname switch.
 */
export const Route = createFileRoute("/agents")({
  beforeLoad: async ({ location }) => ({
    sessionContext: await requireSession(location.href),
  }),
  component: AgentsLayout,
});

function AgentsLayout() {
  const { sessionContext } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [recentDrawerOpen, setRecentDrawerOpen] = useState(false);
  const isRunsRoute = pathname.startsWith("/agents/runs");
  const isOrgChartRoute = pathname === "/agents/org-chart";
  const isCoworkerEditorRoute = pathname.startsWith("/agents/edit/");
  const isCoworkerInfoRoute = pathname.startsWith("/agents/info/");
  const isAgentsIndexRoute = pathname === "/agents" || pathname === "/agents/";

  useEffect(() => {
    const handleOpenDrawer = () => setRecentDrawerOpen(true);
    window.addEventListener(COWORKERS_OPEN_RECENT_DRAWER_EVENT, handleOpenDrawer);
    return () => window.removeEventListener(COWORKERS_OPEN_RECENT_DRAWER_EVENT, handleOpenDrawer);
  }, []);

  return (
    <AuthenticatedAppRootShell initialPrincipal={sessionContext.principal}>
      {isRunsRoute || isOrgChartRoute || isCoworkerInfoRoute ? (
        <Outlet />
      ) : isCoworkerEditorRoute ? (
        <div className="bg-background flex h-full min-h-0 w-full flex-1 overflow-hidden">
          <Outlet />
        </div>
      ) : (
        <div className="bg-background min-h-screen">
          <main className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-16 md:px-8 md:pt-10">
            {isAgentsIndexRoute ? <CoworkersPage /> : <Outlet />}
          </main>
        </div>
      )}

      <MobileRecentDrawer
        open={recentDrawerOpen}
        onOpenChange={setRecentDrawerOpen}
        mode="coworkers"
      />
    </AuthenticatedAppRootShell>
  );
}
