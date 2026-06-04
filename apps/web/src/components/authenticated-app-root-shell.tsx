import type { ReactNode } from "react";
import type { SessionPrincipal } from "@/lib/route-guards";
import { AppRootShell } from "@/components/app-root-shell";

export function AuthenticatedAppRootShell({
  children,
  initialPrincipal = null,
}: {
  children: ReactNode;
  initialPrincipal?: SessionPrincipal | null;
}) {
  return (
    <AppRootShell hasSession initialPrincipal={initialPrincipal}>
      {children}
    </AppRootShell>
  );
}
