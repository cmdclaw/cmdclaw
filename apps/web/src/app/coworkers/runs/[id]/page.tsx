"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { ChatArea } from "@/components/chat/chat-area";
import {
  extractRemoteRunSourceDetails,
  RemoteRunSourceBanner,
} from "@/components/coworkers/remote-run-source-banner";
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
        <RunDebugDetails debugInfo={run.debugInfo} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RemoteRunSourceBanner source={remoteRunSource} />
      {(run.status === "error" || run.status === "cancelled") && (
        <div className="border-b p-4">
          <p className="text-muted-foreground text-sm">{run.errorMessage ?? "Run failed."}</p>
          <RunDebugDetails debugInfo={run.debugInfo} />
        </div>
      )}
      <ChatArea conversationId={run.conversationId} />
    </div>
  );
}

function RunDebugDetails({ debugInfo }: { debugInfo: unknown }) {
  if (!debugInfo || typeof debugInfo !== "object") {
    return null;
  }

  const data = debugInfo as Record<string, unknown>;
  const originalErrorMessage =
    typeof data.originalErrorMessage === "string" ? data.originalErrorMessage : null;
  const originalErrorPhase =
    typeof data.originalErrorPhase === "string" ? data.originalErrorPhase : null;
  const runtimeFailure = typeof data.runtimeFailure === "string" ? data.runtimeFailure : null;

  return (
    <details className="mt-3 rounded-lg border border-dashed px-3 py-2">
      <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
        Technical details
      </summary>
      <div className="mt-2 space-y-1">
        {originalErrorMessage ? (
          <p className="text-xs">
            <span className="text-muted-foreground">Original error:</span> {originalErrorMessage}
          </p>
        ) : null}
        {originalErrorPhase ? (
          <p className="text-xs">
            <span className="text-muted-foreground">Phase:</span> {originalErrorPhase}
          </p>
        ) : null}
        {runtimeFailure ? (
          <p className="text-xs">
            <span className="text-muted-foreground">Runtime failure:</span> {runtimeFailure}
          </p>
        ) : null}
        <pre className="bg-muted/40 overflow-x-auto rounded-md p-2 text-[11px] leading-relaxed break-words whitespace-pre-wrap">
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      </div>
    </details>
  );
}
