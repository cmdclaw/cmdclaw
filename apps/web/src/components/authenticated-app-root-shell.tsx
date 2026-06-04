import type { ReactNode } from "react";
import { AppRootShell } from "@/components/app-root-shell";
import type { SessionPrincipal } from "@/lib/route-guards";

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
