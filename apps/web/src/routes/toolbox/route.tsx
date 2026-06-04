import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthenticatedAppRootShell } from "@/components/authenticated-app-root-shell";
import { requireSession } from "@/lib/route-guards";

/**
 * Protected layout route for the `/toolbox/**` shell (was src/app/toolbox/layout.tsx).
 *
 * Shell selection is route nesting: the toolbox list page plus the source detail / new-source
 * pages all render inside this centered container via `<Outlet />`, rather than a global
 * pathname switch.
 *
 * Access is protected: `beforeLoad` runs the shared session guard, redirecting unauthenticated
 * users to `/login` (or worktree auto-login) with a `callbackUrl` that returns them to the
 * originally requested toolbox path after sign-in.
 */
export const Route = createFileRoute("/toolbox")({
  beforeLoad: async ({ location }) => ({
    sessionContext: await requireSession(location.href),
  }),
  component: ToolboxLayout,
});

function ToolboxLayout() {
  const { sessionContext } = Route.useRouteContext();

  return (
    <AuthenticatedAppRootShell initialPrincipal={sessionContext.principal}>
      <div className="bg-background min-h-screen">
        <main className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-16 sm:px-8 sm:pt-10">
          <Outlet />
        </main>
      </div>
    </AuthenticatedAppRootShell>
  );
}
