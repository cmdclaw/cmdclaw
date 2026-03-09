"use client";

import { Suspense } from "react";
import { SidebarInset, SidebarProvider } from "@/components/animate-ui/components/radix/sidebar";
import { CoworkerRunsSidebar } from "@/components/coworkers/coworker-runs-sidebar";

export default function CoworkerRunsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="bg-background text-foreground h-full min-h-0 [--sidebar-width:20rem]">
      <Suspense fallback={null}>
        <CoworkerRunsSidebar />
      </Suspense>
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
