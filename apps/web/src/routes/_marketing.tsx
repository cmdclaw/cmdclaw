import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Pathless layout route for public marketing pages (access = public, no auth).
 *
 * Shell selection is route nesting, not a global pathname switch: every page under
 * `_marketing/*` renders inside this layout while keeping its exact public URL (the
 * `_marketing` segment is pathless, so `/pricing`, `/avatar`, etc. are unchanged).
 *
 * The app providers and toast surface come from the root shell, so this layout only keeps
 * public marketing pages grouped under a pathless route boundary.
 */
export const Route = createFileRoute("/_marketing")({
  component: MarketingLayout,
});

function MarketingLayout() {
  return <Outlet />;
}
