"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AnimatedTabs, AnimatedTab } from "@/components/ui/tabs";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { clientEditionCapabilities } from "@/lib/edition";

const adminTabs = [
  { key: "settings", label: "Settings", href: "/admin" },
  { key: "subscriptions", label: "AI Subscriptions", href: "/admin/subscriptions" },
  { key: "workspaces", label: "Workspaces", href: "/admin/workspaces" },
  { key: "credits", label: "Credits", href: "/admin/credits" },
  { key: "usage", label: "Usage", href: "/admin/usage" },
  { key: "impersonation", label: "Impersonation", href: "/admin/impersonation" },
  { key: "whatsapp", label: "WhatsApp", href: "/admin/whatsapp" },
];

function getActiveKey(pathname: string) {
  if (pathname.startsWith("/admin/subscriptions")) {
    return "subscriptions";
  }
  if (pathname.startsWith("/admin/workspaces")) {
    return "workspaces";
  }
  if (pathname.startsWith("/admin/credits")) {
    return "credits";
  }
  if (pathname.startsWith("/admin/usage")) {
    return "usage";
  }
  if (pathname.startsWith("/admin/impersonation")) {
    return "impersonation";
  }
  if (pathname.startsWith("/admin/whatsapp")) {
    return "whatsapp";
  }
  return "settings";
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, isLoading } = useIsAdmin();
  const activeKey = getActiveKey(pathname);

  useEffect(() => {
    if (!clientEditionCapabilities.hasSupportAdmin) {
      router.replace("/instance");
    }
  }, [router]);

  if (!clientEditionCapabilities.hasSupportAdmin) {
    return (
      <div className="bg-background min-h-full">
        <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-10 md:px-6 md:pt-10">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-full">
      <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-10 md:px-6 md:pt-10">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : !isAdmin ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
            You do not have access to this section.
          </div>
        ) : (
          <>
            <div className="mb-6">
              <AnimatedTabs activeKey={activeKey}>
                {adminTabs.map((tab) => (
                  <AnimatedTab key={tab.key} value={tab.key} href={tab.href}>
                    {tab.label}
                  </AnimatedTab>
                ))}
              </AnimatedTabs>
            </div>
            {children}
          </>
        )}
      </main>
    </div>
  );
}
