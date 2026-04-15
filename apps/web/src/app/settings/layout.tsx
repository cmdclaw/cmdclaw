"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { AnimatedTabs, AnimatedTab } from "@/components/ui/tabs";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { clientEditionCapabilities } from "@/lib/edition";

function getActiveKey(pathname: string) {
  if (pathname.startsWith("/settings/workspace")) {
    return "workspace";
  }
  if (pathname.startsWith("/settings/usage")) {
    return "usage";
  }
  if (pathname.startsWith("/settings/billing")) {
    return "billing";
  }
  if (pathname.startsWith("/settings/subscriptions")) {
    return "subscriptions";
  }
  return "general";
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeKey = getActiveKey(pathname);
  const { isAdmin } = useIsAdmin();
  const settingsTabs = useMemo(
    () => [
      { key: "general", label: "General", href: "/settings" },
      { key: "workspace", label: "Workspace", href: "/settings/workspace" },
      ...(clientEditionCapabilities.hasBilling && isAdmin
        ? [
            { key: "usage", label: "Usage", href: "/settings/usage" },
            { key: "billing", label: "Billing", href: "/settings/billing" },
          ]
        : []),
      { key: "subscriptions", label: "Connected AI Account", href: "/settings/subscriptions" },
    ],
    [isAdmin],
  );

  return (
    <div className="bg-background min-h-full">
      <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-10 md:px-6 md:pt-10">
        <div className="-mx-4 mb-6 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] md:mx-0 md:overflow-x-visible md:px-0 [&::-webkit-scrollbar]:hidden">
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
  );
}
