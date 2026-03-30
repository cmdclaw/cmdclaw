"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleOff,
  KeyRound,
  Loader2,
  Pause,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { AuthRequestCard } from "@/components/chat/auth-request-card";
import { ToolApprovalCard } from "@/components/chat/tool-approval-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  InboxItem as InboxItemType,
  InboxItemStatus,
  ToolApprovalData,
} from "./inbox-mock-data";
import { InboxEditForm } from "./inbox-edit-form";
import { useInboxStore } from "./inbox-store";

const STATUS_CONFIG: Record<
  InboxItemStatus,
  { color: string; pulse?: boolean; icon: React.ComponentType<{ className?: string }> }
> = {
  running: { color: "bg-blue-500", pulse: true, icon: Loader2 },
  awaiting_approval: { color: "bg-amber-500", pulse: true, icon: ShieldCheck },
  awaiting_auth: { color: "bg-orange-500", pulse: true, icon: KeyRound },
  paused: { color: "bg-zinc-500", icon: Pause },
  completed: { color: "bg-emerald-500", icon: Check },
  error: { color: "bg-red-500", icon: AlertTriangle },
  cancelled: { color: "bg-zinc-500", icon: CircleOff },
};

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

function StatusDot({ status }: { status: InboxItemStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {config.pulse && (
        <span
          className={cn("absolute inset-0 rounded-full opacity-40 animate-ping", config.color)}
        />
      )}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", config.color)} />
    </span>
  );
}

function InboxItemReplyField() {
  const [reply, setReply] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setReply(e.target.value);
  }, []);

  const handleSend = useCallback(() => {
    if (!reply.trim()) {
      return;
    }
    setReply("");
  }, [reply]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={reply}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Reply to agent..."
          className="border-border/50 bg-background text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:ring-ring/50 h-8 w-full rounded-md border px-3 pr-8 text-[12px] transition-colors outline-none focus:ring-1"
        />
        {reply.trim() && (
          <button
            type="button"
            onClick={handleSend}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function InboxItem({ item }: { item: InboxItemType }) {
  const {
    expandedIds,
    editingIds,
    toggleExpanded,
    toggleEditing,
    updateStatus,
    updateToolApproval,
  } = useInboxStore();
  const isExpanded = expandedIds.has(item.id);
  const isEditing = editingIds.has(item.id);
  const statusConfig = STATUS_CONFIG[item.status];
  const StatusIcon = statusConfig.icon;

  const needsAction =
    item.status === "awaiting_approval" ||
    item.status === "awaiting_auth" ||
    item.status === "error";

  const handleToggle = useCallback(() => {
    toggleExpanded(item.id);
  }, [item.id, toggleExpanded]);

  const handleApprove = useCallback(() => {
    updateStatus(item.id, "running");
  }, [item.id, updateStatus]);

  const handleReject = useCallback(() => {
    updateStatus(item.id, "cancelled");
  }, [item.id, updateStatus]);

  const handleRetry = useCallback(() => {
    updateStatus(item.id, "running");
  }, [item.id, updateStatus]);

  const handleStop = useCallback(() => {
    updateStatus(item.id, "cancelled");
  }, [item.id, updateStatus]);

  const handleApproveInline = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleApprove();
    },
    [handleApprove],
  );

  const handleRejectInline = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleReject();
    },
    [handleReject],
  );

  const handleRetryInline = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleRetry();
    },
    [handleRetry],
  );

  const handleStopInline = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleStop();
    },
    [handleStop],
  );

  // Auth request handlers
  const handleAuthConnect = useCallback(() => {
    updateStatus(item.id, "running");
  }, [item.id, updateStatus]);

  const handleAuthCancel = useCallback(() => {
    updateStatus(item.id, "cancelled");
  }, [item.id, updateStatus]);

  // Edit handlers
  const handleEditToggle = useCallback(() => {
    toggleEditing(item.id);
  }, [item.id, toggleEditing]);

  const handleEditSave = useCallback(
    (updated: ToolApprovalData) => {
      updateToolApproval(item.id, updated);
    },
    [item.id, updateToolApproval],
  );

  const handleEditCancel = useCallback(() => {
    toggleEditing(item.id);
  }, [item.id, toggleEditing]);

  // Determine the approval card status based on item status
  const approvalCardStatus =
    item.status === "awaiting_approval"
      ? "pending"
      : item.status === "cancelled"
        ? "denied"
        : "approved";

  return (
    <div
      className={cn(
        "group/item rounded-lg border transition-colors overflow-hidden",
        needsAction && "bg-accent/20",
        isExpanded && "bg-accent/20",
      )}
    >
      {/* Main row */}
      <button
        type="button"
        onClick={handleToggle}
        className="hover:bg-accent/30 flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors"
      >
        <StatusDot status={item.status} />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              "truncate text-sm font-medium",
              item.status === "completed" || item.status === "cancelled"
                ? "text-muted-foreground line-through decoration-muted-foreground/30"
                : "text-foreground",
            )}
          >
            {item.title}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Inline action buttons — visible on hover, hidden when expanded */}
          {!isExpanded && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/item:opacity-100">
              {item.status === "awaiting_approval" && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                    onClick={handleApproveInline}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] text-red-500 hover:bg-red-500/10 hover:text-red-400"
                    onClick={handleRejectInline}
                  >
                    <X className="mr-1 h-3 w-3" />
                    Reject
                  </Button>
                </>
              )}
              {item.status === "error" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground h-6 px-2 text-[11px]"
                  onClick={handleRetryInline}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Retry
                </Button>
              )}
              {(item.status === "running" || item.status === "paused") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground h-6 px-2 text-[11px]"
                  onClick={handleStopInline}
                >
                  <Square className="mr-1 h-3 w-3" />
                  Stop
                </Button>
              )}
            </div>
          )}

          {/* Agent @username */}
          <span className="text-muted-foreground hidden items-center text-xs sm:inline-flex">
            @{item.agentName.toLowerCase().replaceAll(" ", "-")}
          </span>

          {/* Timestamp */}
          <span className="text-muted-foreground/60 w-8 text-right text-xs tabular-nums">
            {formatRelative(item.updatedAt)}
          </span>

          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/40 transition-transform duration-150",
              isExpanded && "rotate-90",
            )}
          />
        </div>
      </button>

      {/* Expanded detail panel */}
      {isExpanded && (
        <div className="border-border/30 min-w-0 space-y-4 overflow-hidden border-t px-5 py-4">
          {/* Status detail line */}
          <div className="text-muted-foreground flex items-center gap-2 text-[12px]">
            <StatusIcon
              className={cn(
                "h-3.5 w-3.5",
                item.status === "running" && "animate-spin text-blue-400",
                item.status === "awaiting_approval" && "text-amber-400",
                item.status === "awaiting_auth" && "text-orange-400",
                item.status === "error" && "text-red-400",
                item.status === "completed" && "text-emerald-400",
                item.status === "paused" && "text-zinc-400",
                item.status === "cancelled" && "text-zinc-400",
              )}
            />
            <span className="font-mono text-[11px] tracking-wide uppercase">
              {item.status.replaceAll("_", " ")}
            </span>
            <span className="text-muted-foreground/40">|</span>
            <span>@{item.agentName.toLowerCase().replaceAll(" ", "-")}</span>
            <span className="text-muted-foreground/40">|</span>
            <span className="tabular-nums">{formatRelative(item.createdAt)} ago</span>
          </div>

          {/* Tool Approval Card — shows the full preview of what the agent wants to do */}
          {item.toolApproval && !isEditing && (
            <div className="space-y-2">
              <div className="[&_.whitespace-pre-wrap]:break-words [&_pre]:break-words [&_pre]:whitespace-pre-wrap">
                <ToolApprovalCard
                  toolUseId={item.toolApproval.toolUseId}
                  toolName={item.toolApproval.toolName}
                  toolInput={item.toolApproval.toolInput}
                  integration={item.toolApproval.integration}
                  operation={item.toolApproval.operation}
                  command={item.toolApproval.command}
                  status={approvalCardStatus}
                  onApprove={handleApprove}
                  onDeny={handleReject}
                />
              </div>
              {item.status === "awaiting_approval" && (
                <div className="flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                  <span className="text-muted-foreground flex-1 text-[12px]">
                    Want to modify the action before approving?
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-blue-500/30 text-[12px] text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                    onClick={handleEditToggle}
                  >
                    <Pencil className="mr-1.5 h-3 w-3" />
                    Edit
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Edit form — replaces the approval card when editing */}
          {item.toolApproval && isEditing && (
            <InboxEditForm
              toolApproval={item.toolApproval}
              onSave={handleEditSave}
              onCancel={handleEditCancel}
            />
          )}

          {/* Auth Request Card — shows which integrations need connecting */}
          {item.authRequest && (
            <AuthRequestCard
              integrations={item.authRequest.integrations}
              connectedIntegrations={item.authRequest.connectedIntegrations}
              reason={item.authRequest.reason}
              status={item.status === "awaiting_auth" ? "pending" : "cancelled"}
              onConnect={handleAuthConnect}
              onCancel={handleAuthCancel}
            />
          )}

          {/* Error message */}
          {item.errorMessage && item.status === "error" && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
              <p className="font-mono text-[12px] text-red-400">{item.errorMessage}</p>
            </div>
          )}

          {/* Action buttons for statuses without a card */}
          {!item.toolApproval && !item.authRequest && (
            <div className="flex items-center gap-2">
              {item.status === "error" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[12px]"
                  onClick={handleRetry}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Retry
                </Button>
              )}
              {(item.status === "running" || item.status === "paused") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[12px]"
                  onClick={handleStop}
                >
                  <Square className="mr-1 h-3.5 w-3.5" />
                  Stop
                </Button>
              )}
            </div>
          )}

          {/* Reply field */}
          <InboxItemReplyField />
        </div>
      )}
    </div>
  );
}
