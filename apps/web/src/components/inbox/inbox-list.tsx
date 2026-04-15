"use client";

import { useCallback } from "react";
import type { InboxCoworkerItem, InboxItem as InboxItemType, ToolApprovalData } from "./types";
import { InboxItem } from "./inbox-item";

type Props = {
  items: InboxItemType[];
  expandedIds: Set<string>;
  editingIds: Set<string>;
  busyItemId?: string | null;
  onToggleExpanded: (id: string) => void;
  onToggleEditing: (id: string) => void;
  onApprove: (item: InboxItemType, questionAnswers?: string[][]) => void;
  onDeny: (item: InboxItemType) => void;
  onStop: (item: InboxItemType) => void;
  onContinue: (item: InboxItemType) => void;
  onAuthConnect: (item: InboxItemType, integration: string) => void;
  onAuthCancel: (item: InboxItemType) => void;
  onSaveEdit: (item: InboxItemType, updated: ToolApprovalData) => void;
  onReply: (item: InboxItemType, message: string) => void;
  onOpenTarget: (item: InboxItemType) => void;
  onOpenBuilder: (item: InboxCoworkerItem) => void;
  onMarkAsRead: (item: InboxItemType) => void;
};

export function InboxList({
  items,
  expandedIds,
  editingIds,
  busyItemId,
  onToggleExpanded,
  onToggleEditing,
  onApprove,
  onDeny,
  onStop,
  onContinue,
  onAuthConnect,
  onAuthCancel,
  onSaveEdit,
  onReply,
  onOpenTarget,
  onOpenBuilder,
  onMarkAsRead,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border p-16">
        <div className="space-y-2 text-center">
          <p className="text-muted-foreground text-sm font-medium">No items in inbox</p>
          <p className="text-muted-foreground/60 text-[13px]">
            Approvals, auth requests, continuation tasks, and errors will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <InboxListRow
          key={item.id}
          item={item}
          isExpanded={expandedIds.has(item.id)}
          isEditing={editingIds.has(item.id)}
          isBusy={busyItemId === item.id}
          onToggleExpanded={onToggleExpanded}
          onToggleEditing={onToggleEditing}
          onApprove={onApprove}
          onDeny={onDeny}
          onStop={onStop}
          onContinue={onContinue}
          onAuthConnect={onAuthConnect}
          onAuthCancel={onAuthCancel}
          onSaveEdit={onSaveEdit}
          onReply={onReply}
          onOpenTarget={onOpenTarget}
          onOpenBuilder={onOpenBuilder}
          onMarkAsRead={onMarkAsRead}
        />
      ))}
    </div>
  );
}

function InboxListRow({
  item,
  isExpanded,
  isEditing,
  isBusy,
  onToggleExpanded,
  onToggleEditing,
  onApprove,
  onDeny,
  onStop,
  onContinue,
  onAuthConnect,
  onAuthCancel,
  onSaveEdit,
  onReply,
  onOpenTarget,
  onOpenBuilder,
  onMarkAsRead,
}: {
  item: InboxItemType;
  isExpanded: boolean;
  isEditing: boolean;
  isBusy: boolean;
  onToggleExpanded: (id: string) => void;
  onToggleEditing: (id: string) => void;
  onApprove: (item: InboxItemType, questionAnswers?: string[][]) => void;
  onDeny: (item: InboxItemType) => void;
  onStop: (item: InboxItemType) => void;
  onContinue: (item: InboxItemType) => void;
  onAuthConnect: (item: InboxItemType, integration: string) => void;
  onAuthCancel: (item: InboxItemType) => void;
  onSaveEdit: (item: InboxItemType, updated: ToolApprovalData) => void;
  onReply: (item: InboxItemType, message: string) => void;
  onOpenTarget: (item: InboxItemType) => void;
  onOpenBuilder: (item: InboxCoworkerItem) => void;
  onMarkAsRead: (item: InboxItemType) => void;
}) {
  const handleToggle = useCallback(() => {
    onToggleExpanded(item.id);
  }, [item.id, onToggleExpanded]);
  const handleToggleEditing = useCallback(() => {
    onToggleEditing(item.id);
  }, [item.id, onToggleEditing]);
  const handleApprove = useCallback(
    (questionAnswers?: string[][]) => {
      onApprove(item, questionAnswers);
    },
    [item, onApprove],
  );
  const handleDeny = useCallback(() => {
    onDeny(item);
  }, [item, onDeny]);
  const handleStop = useCallback(() => {
    onStop(item);
  }, [item, onStop]);
  const handleContinue = useCallback(() => {
    onContinue(item);
  }, [item, onContinue]);
  const handleAuthConnect = useCallback(
    (integration: string) => {
      onAuthConnect(item, integration);
    },
    [item, onAuthConnect],
  );
  const handleAuthCancel = useCallback(() => {
    onAuthCancel(item);
  }, [item, onAuthCancel]);
  const handleSaveEdit = useCallback(
    (updated: ToolApprovalData) => {
      onSaveEdit(item, updated);
    },
    [item, onSaveEdit],
  );
  const handleReply = useCallback(
    (message: string) => {
      onReply(item, message);
    },
    [item, onReply],
  );
  const handleOpenTarget = useCallback(() => {
    onOpenTarget(item);
  }, [item, onOpenTarget]);
  const handleOpenBuilder = useCallback(() => {
    if (item.kind !== "coworker") {
      return;
    }
    onOpenBuilder(item);
  }, [item, onOpenBuilder]);
  const handleMarkAsRead = useCallback(() => {
    onMarkAsRead(item);
  }, [item, onMarkAsRead]);

  return (
    <InboxItem
      item={item}
      isExpanded={isExpanded}
      isEditing={isEditing}
      isBusy={isBusy}
      onToggle={handleToggle}
      onToggleEditing={handleToggleEditing}
      onApprove={handleApprove}
      onDeny={handleDeny}
      onStop={handleStop}
      onContinue={handleContinue}
      onAuthConnect={handleAuthConnect}
      onAuthCancel={handleAuthCancel}
      onSaveEdit={handleSaveEdit}
      onReply={handleReply}
      onOpenTarget={handleOpenTarget}
      onOpenBuilder={item.kind === "coworker" ? handleOpenBuilder : undefined}
      onMarkAsRead={handleMarkAsRead}
    />
  );
}
