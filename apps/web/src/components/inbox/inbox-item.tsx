"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Loader2,
  Pencil,
  Send,
  ShieldCheck,
  Square,
  Wrench,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AuthRequestCard } from "@/components/chat/auth-request-card";
import { ToolApprovalCard } from "@/components/chat/tool-approval-card";
import { CoworkerAvatar } from "@/components/coworker-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InboxItem as InboxItemType, ToolApprovalData } from "./types";
import { InboxEditForm } from "./inbox-edit-form";

const STATUS_CONFIG = {
  awaiting_approval: { color: "bg-amber-500", icon: ShieldCheck },
  awaiting_auth: { color: "bg-orange-500", icon: KeyRound },
  error: { color: "bg-red-500", icon: AlertTriangle },
} as const;

function formatRelative(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function StatusDot({ status }: { status: InboxItemType["status"] }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className={cn("absolute inset-0 animate-ping rounded-full opacity-40", config.color)} />
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", config.color)} />
    </span>
  );
}

function ReplyField({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (message: string) => void;
}) {
  const [value, setValue] = useState("");
  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    onSend(trimmed);
    setValue("");
  }, [onSend, value]);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Reply and open thread..."
        disabled={disabled}
        className="border-border/50 bg-background text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:ring-ring/50 h-8 w-full rounded-md border px-3 text-[12px] outline-none focus:ring-1 disabled:opacity-50"
      />
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        disabled={disabled || !value.trim()}
        onClick={handleSend}
      >
        <Send className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

type Props = {
  item: InboxItemType;
  isExpanded: boolean;
  isEditing: boolean;
  isBusy?: boolean;
  onToggle: () => void;
  onToggleEditing: () => void;
  onApprove: (questionAnswers?: string[][]) => void;
  onDeny: () => void;
  onStop: () => void;
  onAuthConnect: (integration: string) => void;
  onAuthCancel: () => void;
  onSaveEdit: (updated: ToolApprovalData) => void;
  onReply: (message: string) => void;
  onOpenTarget: () => void;
  onOpenBuilder?: () => void;
  onMarkAsRead: () => void;
};

export function InboxItem({
  item,
  isExpanded,
  isEditing,
  isBusy,
  onToggle,
  onToggleEditing,
  onApprove,
  onDeny,
  onStop,
  onAuthConnect,
  onAuthCancel,
  onSaveEdit,
  onReply,
  onOpenTarget,
  onOpenBuilder,
  onMarkAsRead,
}: Props) {
  const statusConfig = STATUS_CONFIG[item.status];
  const StatusIcon = statusConfig.icon;
  const sourceLabel = useMemo(
    () => (item.kind === "coworker" ? `@${item.coworkerName}` : "Chat"),
    [item],
  );

  const showStop = Boolean(item.generationId) && item.status !== "error";
  const showBuilder = item.kind === "coworker" && item.status === "error" && item.builderAvailable;

  return (
    <div className="group/item overflow-hidden rounded-lg border transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className="hover:bg-accent/30 flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors"
      >
        <StatusDot status={item.status} />

        {item.kind === "coworker" ? (
          <CoworkerAvatar username={item.coworkerName} size={24} className="rounded-full" />
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{item.title}</span>
            <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-[10px] uppercase">
              {item.kind}
            </span>
          </div>
        </div>

        <div className="text-muted-foreground hidden items-center text-xs sm:inline-flex">
          {sourceLabel}
        </div>

        <span className="text-muted-foreground/60 w-8 text-right text-xs tabular-nums">
          {formatRelative(item.updatedAt)}
        </span>

        {isBusy ? (
          <Loader2 className="text-muted-foreground/40 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ChevronRight
            className={cn(
              "text-muted-foreground/40 h-3.5 w-3.5 transition-transform duration-150",
              isExpanded && "rotate-90",
            )}
          />
        )}
      </button>

      {isExpanded ? (
        <div className="border-border/30 min-w-0 space-y-4 overflow-hidden border-t px-5 py-4">
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-[12px]">
            <StatusIcon
              className={cn(
                "h-3.5 w-3.5",
                item.status === "awaiting_approval" && "text-amber-400",
                item.status === "awaiting_auth" && "text-orange-400",
                item.status === "error" && "text-red-400",
              )}
            />
            <span className="font-mono text-[11px] tracking-wide uppercase">
              {item.status.replaceAll("_", " ")}
            </span>
            <span className="text-muted-foreground/40">|</span>
            <span>{sourceLabel}</span>
            <span className="text-muted-foreground/40">|</span>
            <span className="tabular-nums">{formatRelative(item.createdAt)} ago</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={onOpenTarget}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Open
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={onMarkAsRead}>
              <Check className="mr-1 h-3.5 w-3.5" />
              Mark as read
            </Button>
            {showBuilder && onOpenBuilder ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[12px]"
                onClick={onOpenBuilder}
              >
                <Wrench className="mr-1 h-3.5 w-3.5" />
                Builder
              </Button>
            ) : null}
            {showStop ? (
              <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={onStop}>
                <Square className="mr-1 h-3.5 w-3.5" />
                Stop
              </Button>
            ) : null}
          </div>

          {item.pendingApproval && !isEditing ? (
            <div className="space-y-2">
              <div className="[&_.whitespace-pre-wrap]:break-words [&_pre]:break-words [&_pre]:whitespace-pre-wrap">
                <ToolApprovalCard
                  toolUseId={item.pendingApproval.toolUseId}
                  toolName={item.pendingApproval.toolName}
                  toolInput={item.pendingApproval.toolInput}
                  integration={item.pendingApproval.integration}
                  operation={item.pendingApproval.operation}
                  command={item.pendingApproval.command}
                  status="pending"
                  onApprove={onApprove}
                  onDeny={onDeny}
                  isLoading={isBusy}
                />
              </div>
              <div className="flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                <Pencil className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                <span className="text-muted-foreground flex-1 text-[12px]">
                  Want to modify the action before approving?
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-blue-500/30 text-[12px] text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                  onClick={onToggleEditing}
                >
                  <Pencil className="mr-1.5 h-3 w-3" />
                  Edit
                </Button>
              </div>
            </div>
          ) : null}

          {item.pendingApproval && isEditing ? (
            <InboxEditForm
              toolApproval={item.pendingApproval}
              onSave={onSaveEdit}
              onCancel={onToggleEditing}
            />
          ) : null}

          {item.pendingAuth ? (
            <AuthRequestCard
              integrations={item.pendingAuth.integrations}
              connectedIntegrations={item.pendingAuth.connectedIntegrations}
              reason={item.pendingAuth.reason}
              status="pending"
              onConnect={onAuthConnect}
              onCancel={onAuthCancel}
              isLoading={isBusy}
            />
          ) : null}

          {item.errorMessage ? (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
              <p className="font-mono text-[12px] text-red-400">{item.errorMessage}</p>
            </div>
          ) : null}

          <ReplyField disabled={isBusy} onSend={onReply} />
        </div>
      ) : null}
    </div>
  );
}
