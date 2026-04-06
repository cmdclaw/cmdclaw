"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  InboxCoworkerItem,
  InboxItem,
  InboxItemStatus,
  ToolApprovalData,
} from "@/components/inbox/types";
import { InboxAgentFilter } from "@/components/inbox/inbox-agent-filter";
import { InboxCreateInput } from "@/components/inbox/inbox-create-input";
import { InboxList } from "@/components/inbox/inbox-list";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  useCancelGeneration,
  useCoworkerList,
  useEnqueueConversationMessage,
  useGetAuthUrl,
  useGetOrCreateBuilderConversation,
  useInboxEditApprovalAndResend,
  useInboxMarkAsRead,
  useInboxItems,
  useSubmitApproval,
  useSubmitAuthResult,
  useTriggerCoworker,
} from "@/orpc/hooks";

const ALL_STATUSES: InboxItemStatus[] = ["awaiting_approval", "awaiting_auth", "error"];
const DEFAULT_STATUS_FILTERS: InboxItemStatus[] = ["awaiting_approval", "awaiting_auth"];

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeInboxItems(items: InboxItem[] | undefined): InboxItem[] {
  const normalized: InboxItem[] = [];
  for (const item of items ?? []) {
    if (item.kind === "coworker") {
      normalized.push({
        kind: "coworker",
        id: item.id,
        runId: item.runId,
        coworkerId: item.coworkerId,
        coworkerName: item.coworkerName,
        builderAvailable: item.builderAvailable,
        title: item.title,
        status: item.status,
        updatedAt: toDate(item.updatedAt),
        createdAt: toDate(item.createdAt),
        generationId: item.generationId,
        conversationId: item.conversationId,
        errorMessage: item.errorMessage,
        pendingApproval: item.pendingApproval,
        pendingAuth: item.pendingAuth,
      });
      continue;
    }

    normalized.push({
      kind: "chat",
      id: item.id,
      conversationId: item.conversationId,
      conversationTitle: item.conversationTitle,
      title: item.title,
      status: item.status,
      updatedAt: toDate(item.updatedAt),
      createdAt: toDate(item.createdAt),
      generationId: item.generationId,
      errorMessage: item.errorMessage,
      pendingApproval: item.pendingApproval,
      pendingAuth: item.pendingAuth,
    });
  }
  return normalized;
}

function InboxPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authCallbackHandledRef = useRef<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "coworkers" | "chats">("all");
  const [statusFilters, setStatusFilters] = useState<InboxItemStatus[]>(DEFAULT_STATUS_FILTERS);
  const [sourceCoworkerId, setSourceCoworkerId] = useState<string | undefined>(undefined);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  }, []);

  const inboxQuery = useInboxItems({
    limit: 20,
    type: typeFilter,
    statuses: statusFilters,
    sourceCoworkerId: typeFilter === "chats" ? undefined : sourceCoworkerId,
    query: deferredSearchQuery,
  });
  const coworkersQuery = useCoworkerList();
  const submitApproval = useSubmitApproval();
  const submitAuthResult = useSubmitAuthResult();
  const cancelGeneration = useCancelGeneration();
  const enqueueConversationMessage = useEnqueueConversationMessage();
  const triggerCoworker = useTriggerCoworker();
  const getAuthUrl = useGetAuthUrl();
  const getOrCreateBuilderConversation = useGetOrCreateBuilderConversation();
  const editApprovalAndResend = useInboxEditApprovalAndResend();
  const markInboxItemAsRead = useInboxMarkAsRead();

  useEffect(() => {
    const authComplete = searchParams.get("auth_complete");
    const generationId = searchParams.get("generation_id");
    if (!authComplete || !generationId) {
      return;
    }

    const handledKey = `${generationId}:${authComplete}`;
    if (authCallbackHandledRef.current === handledKey) {
      return;
    }
    authCallbackHandledRef.current = handledKey;

    submitAuthResult
      .mutateAsync({
        generationId,
        integration: authComplete,
        success: true,
      })
      .then(() => {
        router.replace("/inbox");
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to resume auth flow.");
      });
  }, [router, searchParams, submitAuthResult]);

  const items = useMemo(
    () => normalizeInboxItems(inboxQuery.data?.items as InboxItem[] | undefined),
    [inboxQuery.data?.items],
  );
  const sourceOptions = useMemo(
    () =>
      (inboxQuery.data?.sourceOptions ?? []) as Array<{ coworkerId: string; coworkerName: string }>,
    [inboxQuery.data?.sourceOptions],
  );
  const activeCoworkers = useMemo(
    () =>
      ((coworkersQuery.data ?? []) as Array<{ id: string; name: string; status: string }>)
        .filter((coworker) => coworker.status === "on")
        .map((coworker) => ({ id: coworker.id, name: coworker.name })),
    [coworkersQuery.data],
  );

  useEffect(() => {
    if (typeFilter === "chats") {
      setSourceCoworkerId(undefined);
    }
  }, [typeFilter]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleEditing = useCallback((id: string) => {
    setEditingIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleStatus = useCallback((status: InboxItemStatus) => {
    setStatusFilters((current) => {
      if (current.includes(status)) {
        const next = current.filter((value) => value !== status);
        return next.length > 0 ? next : ALL_STATUSES;
      }
      return [...current, status];
    });
  }, []);

  const runItemAction = useCallback(async (itemId: string, action: () => Promise<void>) => {
    setBusyItemId(itemId);
    try {
      await action();
    } finally {
      setBusyItemId(null);
    }
  }, []);

  const handleApprove = useCallback(
    async (item: InboxItem, questionAnswers?: string[][]) => {
      if (!item.generationId || !item.pendingApproval) {
        return;
      }

      await runItemAction(item.id, async () => {
        await submitApproval.mutateAsync({
          generationId: item.generationId!,
          toolUseId: item.pendingApproval!.toolUseId,
          decision: "approve",
          questionAnswers,
        });
      });
    },
    [runItemAction, submitApproval],
  );

  const handleDeny = useCallback(
    async (item: InboxItem) => {
      if (!item.generationId || !item.pendingApproval) {
        return;
      }

      await runItemAction(item.id, async () => {
        await submitApproval.mutateAsync({
          generationId: item.generationId!,
          toolUseId: item.pendingApproval!.toolUseId,
          decision: "deny",
        });
      });
    },
    [runItemAction, submitApproval],
  );

  const handleStop = useCallback(
    async (item: InboxItem) => {
      if (!item.generationId) {
        return;
      }

      await runItemAction(item.id, async () => {
        await cancelGeneration.mutateAsync(item.generationId!);
      });
    },
    [cancelGeneration, runItemAction],
  );

  const handleAuthConnect = useCallback(
    async (item: InboxItem, integration: string) => {
      if (!item.generationId) {
        return;
      }

      await runItemAction(item.id, async () => {
        const result = await getAuthUrl.mutateAsync({
          type: integration as
            | "google_gmail"
            | "outlook"
            | "outlook_calendar"
            | "google_calendar"
            | "google_docs"
            | "google_sheets"
            | "google_drive"
            | "notion"
            | "linear"
            | "github"
            | "airtable"
            | "slack"
            | "hubspot"
            | "linkedin"
            | "salesforce"
            | "dynamics"
            | "reddit"
            | "twitter",
          redirectUrl: `${window.location.origin}/inbox?auth_complete=${integration}&generation_id=${item.generationId}`,
        });
        window.location.href = result.authUrl;
      });
    },
    [getAuthUrl, runItemAction],
  );

  const handleAuthCancel = useCallback(
    async (item: InboxItem) => {
      const integration = item.pendingAuth?.integrations[0];
      if (!item.generationId || !integration) {
        return;
      }

      await runItemAction(item.id, async () => {
        await submitAuthResult.mutateAsync({
          generationId: item.generationId!,
          integration,
          success: false,
        });
      });
    },
    [runItemAction, submitAuthResult],
  );

  const handleSaveEdit = useCallback(
    async (item: InboxItem, updated: ToolApprovalData) => {
      if (!item.generationId || !item.pendingApproval) {
        return;
      }

      await runItemAction(item.id, async () => {
        if (item.kind === "coworker") {
          await editApprovalAndResend.mutateAsync({
            kind: "coworker",
            generationId: item.generationId!,
            toolUseId: item.pendingApproval!.toolUseId,
            updatedToolInput: updated.toolInput,
            conversationId: item.conversationId ?? "",
            runId: item.runId,
          });
        } else {
          await editApprovalAndResend.mutateAsync({
            kind: "chat",
            generationId: item.generationId!,
            toolUseId: item.pendingApproval!.toolUseId,
            updatedToolInput: updated.toolInput,
            conversationId: item.conversationId,
          });
        }

        setEditingIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      });
    },
    [editApprovalAndResend, runItemAction],
  );

  const handleReply = useCallback(
    async (item: InboxItem, message: string) => {
      const conversationId = item.conversationId;
      if (!conversationId) {
        toast.error("This item does not have a linked conversation yet.");
        return;
      }

      await runItemAction(item.id, async () => {
        await enqueueConversationMessage.mutateAsync({
          conversationId,
          content: message,
          replaceExisting: false,
        });
        router.push(
          item.kind === "chat" ? `/chat/${conversationId}` : `/coworkers/runs/${item.runId}`,
        );
      });
    },
    [enqueueConversationMessage, router, runItemAction],
  );

  const handleOpenTarget = useCallback(
    (item: InboxItem) => {
      if (item.kind === "chat") {
        router.push(`/chat/${item.conversationId}`);
        return;
      }

      router.push(`/coworkers/runs/${item.runId}`);
    },
    [router],
  );

  const handleOpenBuilder = useCallback(
    async (item: InboxCoworkerItem) => {
      await runItemAction(item.id, async () => {
        await getOrCreateBuilderConversation.mutateAsync(item.coworkerId);
        router.push(`/coworkers/${item.coworkerId}`);
      });
    },
    [getOrCreateBuilderConversation, router, runItemAction],
  );
  const handleMarkAsRead = useCallback(
    async (item: InboxItem) => {
      await runItemAction(item.id, async () => {
        await markInboxItemAsRead.mutateAsync({
          kind: item.kind,
          id: item.id,
        });
      });

      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      setEditingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    },
    [markInboxItemAsRead, runItemAction],
  );

  const handleManualTrigger = useCallback(
    async (input: {
      coworkerId: string;
      message: string;
      attachments: Array<{ name: string; mimeType: string; dataUrl: string }>;
    }) => {
      const result = await triggerCoworker.mutateAsync({
        id: input.coworkerId,
        payload: {
          source: "manual_inbox",
          message: input.message,
        },
        fileAttachments: input.attachments,
      });
      toast.success("Run started.");
      router.push(`/coworkers/runs/${result.runId}`);
    },
    [router, triggerCoworker],
  );
  const handleApproveWithToast = useCallback(
    (item: InboxItem, questionAnswers?: string[][]) => {
      void handleApprove(item, questionAnswers).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to approve action.");
      });
    },
    [handleApprove],
  );
  const handleDenyWithToast = useCallback(
    (item: InboxItem) => {
      void handleDeny(item).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to deny action.");
      });
    },
    [handleDeny],
  );
  const handleStopWithToast = useCallback(
    (item: InboxItem) => {
      void handleStop(item).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to stop generation.");
      });
    },
    [handleStop],
  );
  const handleAuthConnectWithToast = useCallback(
    (item: InboxItem, integration: string) => {
      void handleAuthConnect(item, integration).catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to start integration connection.",
        );
      });
    },
    [handleAuthConnect],
  );
  const handleAuthCancelWithToast = useCallback(
    (item: InboxItem) => {
      void handleAuthCancel(item).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to cancel auth request.");
      });
    },
    [handleAuthCancel],
  );
  const handleSaveEditWithToast = useCallback(
    (item: InboxItem, updated: ToolApprovalData) => {
      void handleSaveEdit(item, updated).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to resend edited approval.");
      });
    },
    [handleSaveEdit],
  );
  const handleReplyWithToast = useCallback(
    (item: InboxItem, message: string) => {
      void handleReply(item, message).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to send reply.");
      });
    },
    [handleReply],
  );
  const handleOpenBuilderWithToast = useCallback(
    (item: InboxCoworkerItem) => {
      void handleOpenBuilder(item).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to open builder.");
      });
    },
    [handleOpenBuilder],
  );
  const handleMarkAsReadWithToast = useCallback(
    (item: InboxItem) => {
      void handleMarkAsRead(item).catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to update inbox item.");
      });
    },
    [handleMarkAsRead],
  );

  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto w-full max-w-[960px] px-4 pt-4 pb-16 md:px-8 md:pt-10">
        <div className="mb-5 space-y-3">
          <div className="relative">
            <Search className="text-muted-foreground/50 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search inbox..."
              className="bg-background text-foreground placeholder:text-muted-foreground/40 focus:border-ring focus:ring-ring/50 h-9 w-full rounded-lg border pr-3 pl-9 text-sm transition-colors outline-none focus:ring-1"
            />
          </div>
          <InboxAgentFilter
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            statusFilters={statusFilters}
            onToggleStatus={toggleStatus}
            sourceCoworkerId={sourceCoworkerId}
            onSourceCoworkerChange={setSourceCoworkerId}
            sourceOptions={sourceOptions}
          />
        </div>

        <div className="mb-5 rounded-lg border">
          <InboxCreateInput
            coworkers={activeCoworkers}
            onSubmit={handleManualTrigger}
            isSubmitting={triggerCoworker.isPending}
          />
        </div>

        <InboxList
          items={items}
          expandedIds={expandedIds}
          editingIds={editingIds}
          busyItemId={busyItemId}
          onToggleExpanded={toggleExpanded}
          onToggleEditing={toggleEditing}
          onApprove={handleApproveWithToast}
          onDeny={handleDenyWithToast}
          onStop={handleStopWithToast}
          onAuthConnect={handleAuthConnectWithToast}
          onAuthCancel={handleAuthCancelWithToast}
          onSaveEdit={handleSaveEditWithToast}
          onReply={handleReplyWithToast}
          onOpenTarget={handleOpenTarget}
          onOpenBuilder={handleOpenBuilderWithToast}
          onMarkAsRead={handleMarkAsReadWithToast}
        />
      </main>
    </div>
  );
}

export default function InboxPage() {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950">
          Inbox is currently in beta and limited to admin users.
        </div>
      </div>
    );
  }

  return <InboxPageContent />;
}
