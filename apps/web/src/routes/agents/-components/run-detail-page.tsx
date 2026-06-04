import { T } from "gt-react";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { ChatArea } from "@/components/chat/chat-area";
import {
  extractRemoteRunSourceDetails,
  RemoteRunSourceBanner,
} from "@/components/coworkers/remote-run-source-banner";
import { RunDebugDetails } from "@/components/coworkers/run-debug-details";
import { ImpersonationRequiredPage } from "@/components/impersonation/impersonation-required-page";
import { useCoworkerRun, useCoworkerRunImpersonationTarget } from "@/orpc/hooks/coworkers";
import { useParams, usePathname, useSearchParams } from "../-lib/next-navigation-compat";

export default function CoworkerRunPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const runId = params?.id;
  const { data: run, isLoading } = useCoworkerRun(runId);
  const shouldLoadImpersonationTarget = Boolean(runId && !isLoading && !run);
  const { data: impersonationTarget, isLoading: isImpersonationTargetLoading } =
    useCoworkerRunImpersonationTarget(runId, null, {
      enabled: shouldLoadImpersonationTarget,
    });
  const redirectPath = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : (pathname ?? `/agents/runs/${runId}`);
  }, [pathname, runId, searchParams]);

  if (isLoading || (shouldLoadImpersonationTarget && isImpersonationTargetLoading)) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!run) {
    if (impersonationTarget) {
      return <ImpersonationRequiredPage target={impersonationTarget} redirectPath={redirectPath} />;
    }

    return (
      <div className="text-muted-foreground p-6 text-sm">
        <T>Run not found.</T>
      </div>
    );
  }

  const remoteRunSource = extractRemoteRunSourceDetails(run);

  if (!run.conversationId) {
    return (
      <div className="space-y-4 p-6">
        <h3 className="text-lg font-semibold">
          <T>Run details unavailable in chat view</T>
        </h3>
        <RemoteRunSourceBanner source={remoteRunSource} />
        <p className="text-muted-foreground text-sm">
          <T>
            This run does not have a linked conversation, so it cannot be opened in the chat
            interface.
          </T>
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
          <p className="text-muted-foreground text-sm">
            {run.status === "cancelled"
              ? (run.errorMessage ?? "Run cancelled.")
              : (run.errorMessage ?? "Run failed.")}
          </p>
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
