"use client";

import {
  ChevronDown,
  Flag,
  Home,
  LogOut,
  MessageSquare,
  Plug,
  Search,
  Settings,
  Shield,
  Sparkles,
  Workflow,
  LayoutTemplate,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useWorkflowList } from "@/orpc/hooks";

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>["data"];

type NavItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
};

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      prefetch={false}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-sidebar-foreground/40 px-2.5 text-[11px] font-semibold tracking-wider uppercase">
      {children}
    </span>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionData>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportAttachment, setReportAttachment] = useState<File | null>(null);
  const [reportError, setReportError] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [stoppingImpersonation, setStoppingImpersonation] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const { data: workflows } = useWorkflowList();

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

  // Auto-expand admin section when on admin routes
  useEffect(() => {
    if (pathname?.startsWith("/admin") || pathname?.startsWith("/chat")) {
      setAdminOpen(true);
    }
  }, [pathname]);

  const handleSignOut = useCallback(async () => {
    const { error } = await authClient.signOut();
    if (!error) {
      setSession(null);
      router.push("/login");
    }
  }, [router]);

  const handleStopImpersonating = useCallback(async () => {
    setStoppingImpersonation(true);
    try {
      const result = await authClient.admin.stopImpersonating();
      if (!result.error) {
        window.location.assign("/admin/impersonation");
      }
    } finally {
      setStoppingImpersonation(false);
    }
  }, []);

  const userEmail = session?.user?.email ?? "";
  const avatarInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "";
  const isAdmin = session?.user?.role === "admin";
  const impersonatedBy = (
    session as (SessionData & { session?: { impersonatedBy?: string | null } }) | null
  )?.session?.impersonatedBy;
  const isImpersonating = Boolean(impersonatedBy);

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    if (href === "/chat") {
      return pathname === "/chat" || pathname.startsWith("/chat/");
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  const mainNavItems: NavItem[] = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Search, label: "Search", href: "/search" },
    { icon: LayoutTemplate, label: "Templates", href: "/templates" },
  ];

  const coworkerNavItems: NavItem[] = [
    { icon: Workflow, label: "Workflows", href: "/workflows" },
    { icon: Plug, label: "Integrations", href: "/integrations" },
    { icon: Sparkles, label: "Skills", href: "/skills" },
  ];

  const adminNavItems: NavItem[] = [
    { icon: Shield, label: "Admin", href: "/admin" },
    { icon: MessageSquare, label: "Chat", href: "/chat" },
  ];

  const recentWorkflows = workflows?.slice(0, 5) ?? [];

  const handleSubmitReport = useCallback(async () => {
    const message = reportMessage.trim();
    if (!message) {
      setReportError("Please enter a message.");
      return;
    }

    setIsSubmittingReport(true);
    setReportError("");

    try {
      const formData = new FormData();
      formData.append("message", message);
      if (reportAttachment) {
        formData.append("attachment", reportAttachment);
      }

      const response = await fetch("/api/report", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setReportError(data?.error ?? "Failed to send report.");
        return;
      }

      setReportMessage("");
      setReportAttachment(null);
      setReportOpen(false);
    } catch {
      setReportError("Failed to send report.");
    } finally {
      setIsSubmittingReport(false);
    }
  }, [reportAttachment, reportMessage]);

  const handleReportMessageChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setReportMessage(e.target.value);
      if (reportError) {
        setReportError("");
      }
    },
    [reportError],
  );

  const handleAttachmentChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setReportAttachment(file);
  }, []);

  const openAttachmentPicker = useCallback(() => {
    attachmentInputRef.current?.click();
  }, []);

  const clearAttachment = useCallback(() => {
    setReportAttachment(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }, []);

  const closeReportSheet = useCallback(() => {
    setReportOpen(false);
  }, []);

  const openReportSheet = useCallback(() => {
    setReportOpen(true);
  }, []);

  const toggleAdmin = useCallback(() => {
    setAdminOpen((prev) => !prev);
  }, []);

  return (
    <>
      <Sheet open={reportOpen} onOpenChange={setReportOpen}>
        <SheetContent
          side="right"
          title="Report an issue"
          description="Send a message to Slack"
          className="w-[420px] p-0"
        >
          <SheetHeader>
            <SheetTitle>Report an issue</SheetTitle>
            <SheetDescription>
              This sends your message to the Slack report channel.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 px-4 pb-2">
            <textarea
              value={reportMessage}
              onChange={handleReportMessageChange}
              placeholder="Describe the issue..."
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-[160px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            <input
              ref={attachmentInputRef}
              type="file"
              className="hidden"
              onChange={handleAttachmentChange}
            />
            <div className="mt-3 flex items-center gap-2">
              <Button type="button" variant="outline" onClick={openAttachmentPicker}>
                Add attachment
              </Button>
              {reportAttachment && (
                <>
                  <span className="text-muted-foreground max-w-[180px] truncate text-xs">
                    {reportAttachment.name}
                  </span>
                  <Button type="button" variant="ghost" onClick={clearAttachment}>
                    Remove
                  </Button>
                </>
              )}
            </div>
            {reportError && <p className="text-destructive mt-2 text-xs">{reportError}</p>}
          </div>
          <SheetFooter className="border-t">
            <Button variant="outline" onClick={closeReportSheet} disabled={isSubmittingReport}>
              Cancel
            </Button>
            <Button onClick={handleSubmitReport} disabled={isSubmittingReport}>
              {isSubmittingReport ? "Sending..." : "Send"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <aside className="bg-sidebar flex h-screen w-[220px] shrink-0 flex-col border-r">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Link href="/" prefetch={false} className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="CmdClaw"
              width={24}
              height={24}
              className="object-contain"
            />
            <span className="text-sidebar-foreground text-sm font-semibold tracking-tight">
              CmdClaw
            </span>
          </Link>
        </div>

        {/* Scrollable nav */}
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2.5 pt-1 pb-3">
          {/* Main nav */}
          <div className="flex flex-col gap-0.5">
            {mainNavItems.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
            <NavButton icon={Flag} label="Report" onClick={openReportSheet} />
          </div>

          {/* Coworker section */}
          <div className="flex flex-col gap-1.5">
            <SectionLabel>Coworker</SectionLabel>
            <div className="flex flex-col gap-0.5">
              {coworkerNavItems.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
            </div>
          </div>

          {/* Admin section (collapsible, admin only) */}
          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={toggleAdmin}
                className="text-sidebar-foreground/40 hover:text-sidebar-foreground/60 flex items-center gap-1 px-2.5 text-[11px] font-semibold tracking-wider uppercase transition-colors"
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    !adminOpen && "-rotate-90",
                  )}
                />
                Admin
              </button>
              {adminOpen && (
                <div className="flex flex-col gap-0.5">
                  {adminNavItems.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(item.href)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recent workflows */}
          {recentWorkflows.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <SectionLabel>Recent</SectionLabel>
              <div className="flex flex-col gap-0.5">
                {recentWorkflows.map((wf) => (
                  <Link
                    key={wf.id}
                    href={`/workflows/${wf.id}`}
                    prefetch={false}
                    className={cn(
                      "flex h-7 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors",
                      isActive(`/workflows/${wf.id}`)
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Workflow className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="truncate">{wf.name || "Untitled"}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Footer: user + settings */}
        <div className="border-t px-2.5 py-2.5">
          <Link
            href="/settings"
            prefetch={false}
            className={cn(
              "mb-1 flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
              isActive("/settings")
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span>Settings</span>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="hover:bg-sidebar-accent/50 flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors"
                title={userEmail}
              >
                <span className="bg-sidebar-accent text-sidebar-accent-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                  {avatarInitial}
                </span>
                <span className="text-sidebar-foreground/70 truncate text-[13px]">
                  {userEmail || "Account"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="min-w-48">
              {userEmail && (
                <>
                  <DropdownMenuLabel className="font-normal">
                    <span className="text-muted-foreground text-xs">{userEmail}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem asChild>
                <Link href="/settings" prefetch={false} className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
              {isImpersonating && (
                <DropdownMenuItem
                  onClick={handleStopImpersonating}
                  disabled={stoppingImpersonation}
                >
                  <Shield className="h-4 w-4" />
                  <span>
                    {stoppingImpersonation ? "Stopping impersonation..." : "Stop impersonating"}
                  </span>
                </DropdownMenuItem>
              )}
              {session?.user ? (
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild>
                  <Link href="/login" prefetch={false} className="flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    <span>Log in</span>
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
