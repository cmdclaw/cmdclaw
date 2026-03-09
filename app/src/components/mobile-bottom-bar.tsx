"use client";

import { Cuboid, Home, LayoutTemplate, Menu, MessageSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { MobileMenuSheet } from "@/components/mobile-menu-sheet";
import { cn } from "@/lib/utils";

type BottomTab = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
};

const tabs: BottomTab[] = [
  { icon: MessageSquare, label: "Chat", href: "/chat" },
  { icon: Home, label: "Home", href: "/" },
  { icon: Cuboid, label: "Coworkers", href: "/coworkers" },
  { icon: LayoutTemplate, label: "Templates", href: "/templates" },
];

export function MobileBottomBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = useCallback(
    (href: string) => {
      if (href === "/") {
        return pathname === "/";
      }
      if (href === "/chat") {
        return pathname === "/chat" || pathname.startsWith("/chat/");
      }
      return pathname === href || pathname.startsWith(href + "/");
    },
    [pathname],
  );

  const openMenu = useCallback(() => {
    setMenuOpen(true);
  }, []);

  return (
    <>
      <div className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-sm md:hidden">
        <nav className="flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          {/* Menu button */}
          <button
            type="button"
            onClick={openMenu}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              menuOpen ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Menu className="h-5 w-5" />
            <span>Menu</span>
          </button>

          {/* Nav tabs */}
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                prefetch={false}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <tab.icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <MobileMenuSheet open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}
