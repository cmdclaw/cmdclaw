"use client";

import { useParams } from "next/navigation";
import { ChatCopyButton } from "@/components/chat/chat-copy-button";
import { ChatShareControls } from "@/components/chat/chat-share-controls";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useCoworkerRun } from "@/orpc/hooks";

export default function CoworkerRunLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useIsAdmin();
  const params = useParams<{ id: string }>();
  const runId = params?.id;
  const { data: run } = useCoworkerRun(runId);
  const conversationId = run?.conversationId ?? undefined;
  const runLabel = run?.coworkerUsername
    ? `@${run.coworkerUsername}`
    : run?.coworkerName || (isAdmin && runId ? `ID: ${runId}` : null);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden pb-[calc(3.5rem+var(--safe-area-inset-bottom))] md:pb-0">
      <header className="bg-background flex shrink-0 items-center gap-2 px-4 pt-[max(0.5rem,var(--safe-area-inset-top))] pb-2 md:h-14 md:pt-0 md:pb-0">
        {runLabel ? (
          <span
            className={
              run?.coworkerUsername
                ? "text-foreground max-w-[min(55vw,20rem)] truncate text-sm font-medium"
                : "text-muted-foreground max-w-[min(55vw,20rem)] truncate text-xs"
            }
            title={runLabel}
          >
            {runLabel}
          </span>
        ) : null}
        <ChatCopyButton conversationId={conversationId} className="ml-auto" />
        <ChatShareControls conversationId={conversationId} />
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
