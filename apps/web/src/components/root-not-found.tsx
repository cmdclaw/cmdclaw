import { Link } from "@tanstack/react-router";
import { T } from "gt-react";

/**
 * Root not-found fallback. Detail pages that already have user-facing not-found states
 * provide their own route-level notFoundComponent; this covers unmatched top-level URLs.
 *
 * Uses TanStack Router's <Link> (the framework's navigation primitive). The `to="/"`
 * reference resolves once the home route lands in a later page-migration phase.
 */
export function RootNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">
        <T>Page not found</T>
      </h1>
      <p className="text-muted-foreground max-w-md text-sm">
        <T>The page you are looking for does not exist or has moved.</T>
      </p>
      <Link to="/" className="text-brand text-sm font-medium underline-offset-4 hover:underline">
        <T>Return home</T>
      </Link>
    </main>
  );
}
