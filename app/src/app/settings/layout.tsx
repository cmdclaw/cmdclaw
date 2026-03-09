"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AnimatedTabs, AnimatedTab } from "@/components/ui/tabs";

const settingsTabs = [
  { key: "general", label: "General", href: "/settings" },
  { key: "usage", label: "Usage", href: "/settings/usage" },
  { key: "subscriptions", label: "Subscriptions", href: "/settings/subscriptions" },
];

function getActiveKey(pathname: string) {
  if (pathname.startsWith("/settings/usage")) {
    return "usage";
  }
  if (pathname.startsWith("/settings/subscriptions")) {
    return "subscriptions";
  }
  return "general";
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeKey = getActiveKey(pathname);

  return (
    <AppShell>
      <div className="bg-background min-h-full">
        <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-10 md:px-6 md:pt-10">
          <div className="mb-6">
            <AnimatedTabs activeKey={activeKey}>
              {settingsTabs.map((tab) => (
                <AnimatedTab key={tab.key} value={tab.key} href={tab.href}>
                  {tab.label}
                </AnimatedTab>
              ))}
            </AnimatedTabs>
          </div>
          {children}
        </main>
      </div>
    </AppShell>
  );
}
