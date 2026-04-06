"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { ChatArea } from "@/components/chat/chat-area";
import {
  extractRemoteRunSourceDetails,
  RemoteRunSourceBanner,
} from "@/components/coworkers/remote-run-source-banner";
import { RunDebugDetails } from "@/components/coworkers/run-debug-details";
import { useCoworkerRun } from "@/orpc/hooks";

export default function CoworkerRunPage() {
  const params = useParams<{ id: string }>();
  const runId = params?.id;
  const { data: run, isLoading } = useCoworkerRun(runId);

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!run) {
    return <div className="text-muted-foreground p-6 text-sm">Run not found.</div>;
  }

  const remoteRunSource = extractRemoteRunSourceDetails(run);

  if (!run.conversationId) {
    return (
      <div className="space-y-4 p-6">
        <h3 className="text-lg font-semibold">Run details unavailable in chat view</h3>
        <RemoteRunSourceBanner source={remoteRunSource} />
        <p className="text-muted-foreground text-sm">
          This run does not have a linked conversation, so it cannot be opened in the chat
          interface.
        </p>
        <RunDebugDetails
          debugInfo={run.debugInfo}
          fallbackTimestamp={run.finishedAt ?? run.startedAt}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RemoteRunSourceBanner source={remoteRunSource} />
      {(run.status === "error" || run.status === "cancelled") && (
        <div className="border-b p-4">
          <p className="text-muted-foreground text-sm">{run.errorMessage ?? "Run failed."}</p>
          <RunDebugDetails
            debugInfo={run.debugInfo}
            fallbackTimestamp={run.finishedAt ?? run.startedAt}
          />
        </div>
      )}
      <ChatArea conversationId={run.conversationId} />
    </div>
  );
}
