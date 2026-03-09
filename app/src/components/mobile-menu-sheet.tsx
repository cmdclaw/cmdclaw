"use client";

import { BarChart3, Bug, Settings, Shield, Toolbox } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BugReportDialog } from "@/components/bug-report-dialog";
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
      <Link href={href} prefetch={false} className={classes} onClick={onClick}>
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

type MobileMenuPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MobileMenuPanel({ open, onOpenChange }: MobileMenuPanelProps) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData>(null);
  const [isBugReportOpen, setIsBugReportOpen] = useState(false);

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
      onOpenChange(false);
      router.push("/login");
    }
  }, [router, onOpenChange]);

  const handleItemClick = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleBugReportClick = useCallback(() => {
    onOpenChange(false);
    setIsBugReportOpen(true);
  }, [onOpenChange]);

  const panelStyle = useMemo(
    () => ({ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }),
    [],
  );

  return (
    <>
      <BugReportDialog open={isBugReportOpen} onOpenChange={setIsBugReportOpen} />

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={handleItemClick} />
      )}

      {/* Menu panel - slides up from above the bottom bar */}
      <div
        className={cn(
          "bg-background fixed inset-x-0 bottom-0 z-35 rounded-t-2xl transition-transform duration-300 ease-out md:hidden",
          open ? "translate-y-0" : "translate-y-full",
        )}
        style={panelStyle}
      >
        {/* Account row */}
        <div className="flex items-center justify-between border-b px-4 pt-5 pb-4">
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
        <div className="flex flex-col gap-0.5 px-1 py-2">
          <MenuItem icon={Toolbox} label="Toolbox" href="/toolbox" onClick={handleItemClick} />
          <MenuItem icon={Settings} label="Settings" href="/settings" onClick={handleItemClick} />
          <MenuItem
            icon={BarChart3}
            label="Usage"
            href="/settings/usage"
            onClick={handleItemClick}
          />
          <MenuItem icon={Bug} label="Bug report" onClick={handleBugReportClick} />
          {isAdmin && (
            <MenuItem icon={Shield} label="Admin" href="/admin" onClick={handleItemClick} />
          )}
        </div>
      </div>
    </>
  );
}
