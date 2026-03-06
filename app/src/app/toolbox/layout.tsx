"use client";

import { AppShell } from "@/components/app-shell";

export default function ToolboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="bg-background min-h-screen">
        <main className="mx-auto w-full max-w-[1400px] px-8 pt-10 pb-16">{children}</main>
      </div>
    </AppShell>
  );
}
