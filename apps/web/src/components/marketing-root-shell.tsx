import type React from "react";
import { Toaster } from "@/components/ui/sonner";
import { ORPCProvider } from "@/orpc/provider";

export function MarketingRootShell({ children }: { children: React.ReactNode }) {
  return (
    <ORPCProvider syncSessionUser={false}>
      {children}
      <Toaster />
    </ORPCProvider>
  );
}
