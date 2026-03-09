"use client";

import { BarChart3, Bug, Settings, Shield, Toolbox } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/animate-ui/components/radix/sheet";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>["data"];

type MenuItemProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  badge?: string;
};

function MenuItem({ icon: Icon, label, href, onClick, destructive, badge }: MenuItemProps) {
  const classes = cn(
    "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
    destructive ? "text-destructive hover:bg-destructive/10" : "text-foreground/80 hover:bg-accent",
  );

  const content = (
    <>
      <Icon className="h-5 w-5 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge && <span className="text-xs font-semibold text-orange-500">{badge}</span>}
    </>
  );

  if (href) {
    return (
      <Link href={href} prefetch={false} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cn(classes, "w-full")}>
      {content}
    </button>
  );
}

type MobileMenuSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MobileMenuSheet({ open, onOpenChange }: MobileMenuSheetProps) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData>(null);

  useEffect(() => {
    let mounted = true;
    authClient
      .getSession()
      .then((res) => {
        if (!mounted) {
          return;
        }
        const hasSession = res?.data?.session && res?.data?.user;
        setSession(hasSession ? res.data : null);
      })
      .catch(() => {
        if (mounted) {
          setSession(null);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const userEmail = session?.user?.email ?? "";
  const isAdmin = session?.user?.role === "admin";

  const handleSignOut = useCallback(async () => {
    const { error } = await authClient.signOut();
    if (!error) {
      setSession(null);
      router.push("/login");
    }
  }, [router]);

  const handleItemClick = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        title="Menu"
        showCloseButton={false}
        className="h-auto max-h-[80vh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="bg-muted-foreground/30 h-1 w-10 rounded-full" />
        </div>

        {/* Account row */}
        <div className="flex items-center justify-between border-b px-4 pb-4">
          <div className="flex items-center gap-3">
            {session?.user?.image ? (
              <Image
                src={session.user.image}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <span className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold">
                {userEmail ? userEmail.charAt(0).toUpperCase() : "?"}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">My Account</p>
              {userEmail && <p className="text-muted-foreground truncate text-xs">{userEmail}</p>}
            </div>
          </div>
          {session?.user ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              Log Out
            </button>
          ) : (
            <Link
              href="/login"
              prefetch={false}
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
              onClick={handleItemClick}
            >
              Log In
            </Link>
          )}
        </div>

        {/* Menu items */}
        <div className="flex flex-col gap-0.5 px-1 py-2" onClick={handleItemClick}>
          <MenuItem icon={Toolbox} label="Toolbox" href="/toolbox" />
          <MenuItem icon={Settings} label="Settings" href="/settings" />
          <MenuItem icon={BarChart3} label="Usage" href="/settings/usage" />
          <MenuItem icon={Bug} label="Bug report" href="/support" />
          {isAdmin && <MenuItem icon={Shield} label="Admin" href="/admin" />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
