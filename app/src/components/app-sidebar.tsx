"use client";

import {
  BarChart3,
  Bug,
  CheckCheck,
  Check,
  ChevronDown,
  Home,
  LoaderCircle,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Play,
  Settings,
  Shield,
  Toolbox,
  Trash2,
  Workflow,
  LayoutTemplate,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/animate-ui/components/radix/sheet";
import { useChatDraftStore } from "@/components/chat/chat-draft-store";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  useConversationList,
  useDeleteConversation,
  useMarkAllConversationsSeen,
  useUpdateConversationPinned,
  useUpdateConversationTitle,
  useCoworkerList,
} from "@/orpc/hooks";

type ConversationListData = {
  conversations: Array<{
    id: string;
    title: string | null;
    isPinned: boolean;
    generationStatus:
      | "idle"
      | "generating"
      | "awaiting_approval"
      | "awaiting_auth"
      | "paused"
      | "complete"
      | "error";
    updatedAt: Date;
    messageCount: number;
    seenMessageCount: number;
  }>;
};

const RUNNING_CONVERSATION_STATUSES = new Set([
  "generating",
  "awaiting_approval",
  "awaiting_auth",
  "paused",
]);

function formatRelativeShort(date: Date) {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSeconds < 60) {
    return "now";
  }

  const units: Array<[label: string, seconds: number]> = [
    ["y", 31_536_000],
    ["mo", 2_592_000],
    ["w", 604_800],
    ["d", 86_400],
    ["h", 3_600],
    ["m", 60],
  ];

  for (const [label, seconds] of units) {
    if (diffSeconds >= seconds) {
      return `${Math.floor(diffSeconds / seconds)}${label}`;
    }
  }

  return "now";
}

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
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameConversationId, setRenameConversationId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const { data: coworkers } = useCoworkerList();
  const { data: rawConversationData, isLoading: conversationsLoading } = useConversationList();
  const conversationData = rawConversationData as ConversationListData | undefined;
  const deleteConversation = useDeleteConversation();
  const markAllConversationsSeenMutation = useMarkAllConversationsSeen();
  const updateConversationPinned = useUpdateConversationPinned();
  const updateConversationTitle = useUpdateConversationTitle();

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
    if (pathname?.startsWith("/admin")) {
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
  const isCoworkerPage = pathname === "/coworkers" || pathname.startsWith("/coworkers/");

  // Only animate the recent section when navigating to/from coworkers, not on first load/reload.
  const recentDirection = isCoworkerPage ? 1 : -1;
  const [recentAnimState, setRecentAnimState] = useState<"idle" | "animating">(() => {
    if (typeof window === "undefined") {
      return "idle";
    }
    const prev = sessionStorage.getItem("sidebar-recent");
    const curr = isCoworkerPage ? "coworkers" : "chats";
    sessionStorage.setItem("sidebar-recent", curr);
    return prev !== null && prev !== curr ? "animating" : "idle";
  });
  useEffect(() => {
    if (recentAnimState === "animating") {
      // Trigger animation on next frame so CSS transition picks up the change
      requestAnimationFrame(() => setRecentAnimState("idle"));
    }
  }, [recentAnimState]);
  const recentContentStyle = useMemo(
    () =>
      recentAnimState === "animating"
        ? { opacity: 0, transform: `translateX(${recentDirection * 40}px)` }
        : { opacity: 1, transform: "translateX(0)" },
    [recentAnimState, recentDirection],
  );

  const mainNavItems: NavItem[] = [
    { icon: Home, label: "Home", href: "/" },
    { icon: LayoutTemplate, label: "Templates", href: "/templates" },
  ];

  const coworkerNavItems: NavItem[] = [
    { icon: MessageSquare, label: "Chat", href: "/chat" },
    { icon: Workflow, label: "Coworkers", href: "/coworkers" },
    { icon: Toolbox, label: "Toolbox", href: "/toolbox" },
  ];

  const adminNavItems: NavItem[] = [{ icon: Shield, label: "Admin", href: "/admin" }];

  const recentCoworkers = coworkers?.slice(0, 5) ?? [];
  const recentConversations = conversationData?.conversations ?? [];
  const unreadConversationCount = recentConversations.filter(
    (conversation) => conversation.messageCount > (conversation.seenMessageCount ?? 0),
  ).length;

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteConversation.mutateAsync(id);
      useChatDraftStore.getState().clearDraft(id);
      if (pathname === `/chat/${id}`) {
        router.push("/chat");
      }
    },
    [deleteConversation, pathname, router],
  );

  const handleDeleteMenuClick = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      const id = event.currentTarget.dataset.conversationId;
      if (!id) {
        return;
      }
      await handleDeleteConversation(id);
    },
    [handleDeleteConversation],
  );

  const handlePinMenuClick = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      const id = event.currentTarget.dataset.conversationId;
      if (!id) {
        return;
      }
      const isPinned = event.currentTarget.dataset.conversationPinned === "true";
      await updateConversationPinned.mutateAsync({
        id,
        isPinned: !isPinned,
      });
    },
    [updateConversationPinned],
  );

  const handleRenameMenuClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const id = event.currentTarget.dataset.conversationId;
    if (!id) {
      return;
    }
    setRenameConversationId(id);
    setRenameTitle(event.currentTarget.dataset.conversationTitle ?? "");
    setIsRenameModalOpen(true);
  }, []);

  const handleRenameModalOpenChange = useCallback((open: boolean) => {
    setIsRenameModalOpen(open);
    if (!open) {
      setRenameConversationId(null);
      setRenameTitle("");
    }
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    const trimmedTitle = renameTitle.trim();
    if (!renameConversationId || trimmedTitle.length === 0) {
      return;
    }
    await updateConversationTitle.mutateAsync({
      id: renameConversationId,
      title: trimmedTitle,
    });
    setIsRenameModalOpen(false);
    setRenameConversationId(null);
    setRenameTitle("");
  }, [renameConversationId, renameTitle, updateConversationTitle]);

  const handleRenameInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setRenameTitle(event.target.value);
  }, []);

  const handleRenameFormSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleRenameSubmit();
    },
    [handleRenameSubmit],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (unreadConversationCount === 0 || markAllConversationsSeenMutation.isPending) {
      return;
    }

    await markAllConversationsSeenMutation.mutateAsync();
  }, [markAllConversationsSeenMutation, unreadConversationCount]);

  const handleMarkAllReadClick = useCallback(() => {
    void handleMarkAllRead();
  }, [handleMarkAllRead]);

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
          title="Bug report"
          description="Send a message to Slack"
          className="w-[420px] p-0"
        >
          <SheetHeader>
            <SheetTitle>Bug report</SheetTitle>
            <SheetDescription>
              This sends your bug report to the Slack report channel.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 px-4 pb-2">
            <textarea
              value={reportMessage}
              onChange={handleReportMessageChange}
              placeholder="Describe the bug..."
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

      <AlertDialog open={isRenameModalOpen} onOpenChange={handleRenameModalOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename chat</AlertDialogTitle>
          </AlertDialogHeader>
          <form className="space-y-4" onSubmit={handleRenameFormSubmit}>
            <Input
              value={renameTitle}
              onChange={handleRenameInputChange}
              placeholder="Chat title"
              autoFocus
              maxLength={200}
            />
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={updateConversationTitle.isPending}>
                Cancel
              </AlertDialogCancel>
              <Button
                type="submit"
                disabled={updateConversationTitle.isPending || renameTitle.trim().length === 0}
              >
                {updateConversationTitle.isPending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    Renaming...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    Rename
                  </span>
                )}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

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
        <div className="relative min-h-0 flex-1">
          <nav className="flex h-full flex-col gap-5 overflow-y-auto px-2.5 pt-1 pb-10">
            {/* Main nav */}
            <div className="flex flex-col gap-0.5">
              {mainNavItems.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
              <NavButton icon={Bug} label="Bug report" onClick={openReportSheet} />
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
                  className="text-sidebar-foreground/40 hover:text-sidebar-foreground/60 flex w-full items-center justify-between px-2.5 text-[11px] font-semibold tracking-wider uppercase transition-colors"
                >
                  <span>Admin</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform duration-200",
                      !adminOpen && "-rotate-90",
                    )}
                  />
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

            {/* Recent — contextual: chats on all pages, runs on coworker page */}
            <div className="flex flex-col gap-1.5 overflow-hidden">
              <div
                className="flex flex-col gap-1.5 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                style={recentContentStyle}
              >
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 px-2.5",
                    !isCoworkerPage && "group/recent-chats-header",
                  )}
                >
                  <span className="text-sidebar-foreground/40 text-[11px] font-semibold tracking-wider uppercase">
                    {isCoworkerPage ? "Recent Runs" : "Recent Chats"}
                  </span>
                  {!isCoworkerPage ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "text-sidebar-foreground/45 hover:text-sidebar-foreground h-5 w-5 rounded-sm transition-all",
                            "pointer-events-none opacity-0 group-hover/recent-chats-header:pointer-events-auto group-hover/recent-chats-header:opacity-100",
                            "focus-visible:pointer-events-auto focus-visible:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100",
                          )}
                          aria-label="Recent chat actions"
                        >
                          <MoreHorizontal className="mx-auto h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" side="bottom">
                        <DropdownMenuItem
                          onClick={handleMarkAllReadClick}
                          disabled={
                            unreadConversationCount === 0 ||
                            markAllConversationsSeenMutation.isPending
                          }
                        >
                          {markAllConversationsSeenMutation.isPending ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCheck className="h-4 w-4" />
                          )}
                          <span>Mark all as read</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
                <div className="flex flex-col gap-0.5">
                  {!isCoworkerPage ? (
                    conversationsLoading ? (
                      <span className="text-sidebar-foreground/55 px-2.5 py-1 text-[12px]">
                        Loading...
                      </span>
                    ) : recentConversations.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 px-2.5 py-4 text-center">
                        <MessageSquare className="text-sidebar-foreground/25 h-5 w-5" />
                        <span className="text-sidebar-foreground/40 text-[12px] leading-relaxed">
                          Start a conversation
                          <br />
                          to see it here
                        </span>
                      </div>
                    ) : (
                      recentConversations.map((conversation) => {
                        const isConversationActive = isActive(`/chat/${conversation.id}`);
                        const isConversationRunning = RUNNING_CONVERSATION_STATUSES.has(
                          conversation.generationStatus,
                        );
                        const hasUnreadResults =
                          !isConversationRunning &&
                          !isConversationActive &&
                          conversation.messageCount > (conversation.seenMessageCount ?? 0);
                        const showConversationIndicator = isConversationRunning || hasUnreadResults;

                        return (
                          <div
                            key={conversation.id}
                            className={cn(
                              "group relative flex h-8 items-center rounded-md px-2.5 text-[13px] transition-colors",
                              isConversationActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                            )}
                          >
                            <Link
                              href={`/chat/${conversation.id}`}
                              prefetch={false}
                              className="flex min-w-0 flex-1 items-center"
                            >
                              {isConversationRunning ? (
                                <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
                              ) : hasUnreadResults ? (
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500"
                                  aria-label="New unread results"
                                />
                              ) : null}
                              <span
                                className={cn(
                                  "min-w-0 flex-1 truncate",
                                  showConversationIndicator && "ml-2",
                                )}
                              >
                                {conversation.title || "Untitled"}
                              </span>
                              <span
                                className={cn(
                                  "text-sidebar-foreground/50 ml-2 shrink-0 text-[12px] transition-opacity",
                                  "group-hover:opacity-0 group-focus-within:opacity-0",
                                )}
                              >
                                {formatRelativeShort(new Date(conversation.updatedAt))}
                              </span>
                            </Link>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className={cn(
                                    "text-sidebar-foreground/60 hover:text-sidebar-foreground absolute top-1/2 right-1 z-10 h-6 w-6 -translate-y-1/2 rounded-sm opacity-0 transition-opacity",
                                    "pointer-events-none group-hover:pointer-events-auto focus-visible:pointer-events-auto data-[state=open]:pointer-events-auto",
                                    "group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
                                    "before:pointer-events-none before:absolute before:-inset-y-1 before:-left-9 before:w-9 before:bg-gradient-to-l before:to-transparent",
                                    isConversationActive
                                      ? "before:from-sidebar-accent"
                                      : "before:from-sidebar",
                                  )}
                                  aria-label="Conversation actions"
                                >
                                  <MoreHorizontal className="mx-auto h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" side="right">
                                <DropdownMenuItem
                                  data-conversation-id={conversation.id}
                                  data-conversation-pinned={
                                    conversation.isPinned ? "true" : "false"
                                  }
                                  onClick={handlePinMenuClick}
                                >
                                  {conversation.isPinned ? (
                                    <PinOff className="h-4 w-4" />
                                  ) : (
                                    <Pin className="h-4 w-4" />
                                  )}
                                  <span>{conversation.isPinned ? "Unpin" : "Pin"}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  data-conversation-id={conversation.id}
                                  data-conversation-title={conversation.title ?? ""}
                                  onClick={handleRenameMenuClick}
                                >
                                  <Pencil className="h-4 w-4" />
                                  <span>Rename</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  data-conversation-id={conversation.id}
                                  onClick={handleDeleteMenuClick}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span>Delete</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        );
                      })
                    )
                  ) : recentCoworkers.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-2.5 py-4 text-center">
                      <Play className="text-sidebar-foreground/25 h-5 w-5" />
                      <span className="text-sidebar-foreground/40 text-[12px] leading-relaxed">
                        Run a coworker
                        <br />
                        to see results here
                      </span>
                    </div>
                  ) : (
                    recentCoworkers.map((coworker) => (
                      <Link
                        key={coworker.id}
                        href={`/coworkers/${coworker.id}`}
                        prefetch={false}
                        className={cn(
                          "flex h-7 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors",
                          isActive(`/coworkers/${coworker.id}`)
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <Workflow className="h-3.5 w-3.5 shrink-0 opacity-50" />
                        <span className="truncate">{coworker.name || "Untitled"}</span>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          </nav>
          {/* Fade overlay at bottom of nav */}
          <div className="from-sidebar pointer-events-none absolute right-0 bottom-0 left-0 h-14 bg-gradient-to-t to-transparent" />
        </div>

        {/* Footer: user card */}
        <div className="px-2 pb-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="bg-sidebar-accent/80 hover:bg-sidebar-accent border-sidebar-border flex h-11 w-full items-center gap-2.5 rounded-lg border px-2.5 text-[13px] transition-colors"
                title={userEmail}
              >
                {session?.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt=""
                    width={20}
                    height={20}
                    className="h-5 w-5 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="bg-sidebar-primary text-sidebar-primary-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                    {avatarInitial}
                  </span>
                )}
                <span className="text-sidebar-foreground/80 truncate text-[13px] font-medium">
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
              <DropdownMenuItem asChild>
                <Link href="/settings/usage" prefetch={false} className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  <span>Usage</span>
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
