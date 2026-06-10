import { T, useGT } from "gt-react";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { AgenticAppHtmlErrorCode } from "@/server/services/agentic-app-html";
import { useAgenticAppHtml, useDownloadSandboxFile } from "@/orpc/hooks/conversation";
import { createActivationGate } from "./agentic-app-activation-gate";
import {
  type AgenticAppPromptRejectionReason,
  buildAgenticAppPromptResult,
  parseAgenticAppPromptMessage,
} from "./agentic-app-protocol";
import type { SandboxFileData } from "./message-list";

type Props = {
  outputFile: SandboxFileData;
  onClose: () => void;
  onSendPrompt: (prompt: string) => Promise<unknown>;
};

// Programmatic focus (autofocus, scripted `.focus()`) fires synchronously around the
// iframe load; a genuine user focus-entry comes seconds later. Ignoring focus-entry
// engagement inside this grace window prevents a hostile Agentic-App from self-arming
// the gate on load.
const FOCUS_ENGAGEMENT_LOAD_GRACE_MS = 1000;

function readAgenticAppErrorCode(error: unknown): AgenticAppHtmlErrorCode | "" {
  const record = error && typeof error === "object" ? (error as { data?: unknown }) : null;
  const data =
    record?.data && typeof record.data === "object"
      ? (record.data as { agenticAppCode?: unknown })
      : null;
  const code = data?.agenticAppCode;
  return typeof code === "string" ? (code as AgenticAppHtmlErrorCode) : "";
}

function getAgenticAppErrorCopy(
  error: unknown,
  t: (text: string) => string,
): { title: string; description: string } {
  const code = readAgenticAppErrorCode(error);

  if (code === "too_large") {
    return {
      title: t("output.html is too large to display"),
      description: t("Download output.html to inspect the generated file."),
    };
  }

  if (code === "not_found" || code === "missing_storage") {
    return {
      title: t("output.html is no longer available"),
      description: t("The generated file could not be loaded from storage."),
    };
  }

  return {
    title: t("Agentic-App unavailable"),
    description: t("Download output.html to inspect the generated file."),
  };
}

export function AgenticAppPanel({ outputFile, onClose, onSendPrompt }: Props) {
  const t = useGT();
  const posthog = usePostHog();

  const appHtml = useAgenticAppHtml(outputFile.fileId);
  const { mutateAsync: downloadSandboxFile, isPending: isDownloading } = useDownloadSandboxFile();

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const gateRef = useRef<ReturnType<typeof createActivationGate> | null>(null);
  if (gateRef.current === null) {
    gateRef.current = createActivationGate();
  }
  const loadedAtRef = useRef<number | null>(null);
  const onSendPromptRef = useRef(onSendPrompt);
  onSendPromptRef.current = onSendPrompt;
  const posthogRef = useRef(posthog);
  posthogRef.current = posthog;

  const recordGesture = useCallback(() => {
    gateRef.current?.recordGesture(Date.now());
  }, []);

  const handleIframeLoad = useCallback(() => {
    loadedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    // Clicks inside the sandboxed iframe never reach this document; focus moving into
    // the iframe fires a window blur with the iframe as the active element, which is
    // the parent-side evidence the user clicked into the app. The gate only arms when
    // a real gesture preceded this focus-entry (see createActivationGate).
    const handleWindowBlur = () => {
      if (!iframeRef.current || document.activeElement !== iframeRef.current) {
        return;
      }
      const now = Date.now();
      const loadedAt = loadedAtRef.current;
      if (loadedAt !== null && now - loadedAt < FOCUS_ENGAGEMENT_LOAD_GRACE_MS) {
        return;
      }
      gateRef.current?.recordFocusEntry(now);
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow || event.source !== iframe.contentWindow) {
        return;
      }

      const sourceWindow = event.source as Window;
      const postResult = (
        status: "sent" | "rejected",
        reason?: AgenticAppPromptRejectionReason,
      ) => {
        // The iframe may have detached (unmount, reload) before we reply; never let a
        // failed ack throw, and never ack a window that is no longer our iframe.
        if (iframeRef.current?.contentWindow !== sourceWindow) {
          return;
        }
        try {
          sourceWindow.postMessage(buildAgenticAppPromptResult(status, reason), "*");
        } catch {
          // window gone — nothing to do
        }
      };

      const capture = (status: "sent" | "rejected", reason?: AgenticAppPromptRejectionReason) => {
        posthogRef.current?.capture("agentic_app_prompt", {
          status,
          reason: reason ?? null,
          file_id: outputFile.fileId,
        });
      };

      const parsed = parseAgenticAppPromptMessage(event.data);
      if (parsed.kind === "ignored") {
        return;
      }
      if (parsed.kind === "invalid") {
        capture("rejected", "invalid");
        postResult("rejected", "invalid");
        return;
      }

      const gate = gateRef.current;
      const focused = document.activeElement === iframe;
      const verdict = gate
        ? gate.evaluate(Date.now(), focused)
        : ({ allowed: false, reason: "no_user_activation" } as const);
      if (!verdict.allowed) {
        capture("rejected", verdict.reason);
        postResult("rejected", verdict.reason);
        return;
      }

      void Promise.resolve()
        .then(() => onSendPromptRef.current(parsed.prompt))
        .then((sendResult) => {
          if (sendResult) {
            gate?.recordAccepted(Date.now());
            capture("sent");
            postResult("sent");
          } else {
            capture("rejected");
            postResult("rejected");
          }
        })
        .catch(() => {
          capture("rejected");
          postResult("rejected");
        });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [outputFile.fileId]);

  const handleRefresh = useCallback(() => {
    void appHtml.refetch();
  }, [appHtml]);

  const handleDownload = useCallback(async () => {
    const result = await downloadSandboxFile(outputFile.fileId);
    const link = document.createElement("a");
    link.href = result.url;
    link.download = outputFile.filename;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [downloadSandboxFile, outputFile.fileId, outputFile.filename]);

  return (
    <div
      className="bg-background flex min-h-0 flex-1 flex-col"
      onPointerDownCapture={recordGesture}
      onPointerMoveCapture={recordGesture}
      onKeyDownCapture={recordGesture}
    >
      <div className="border-border/70 flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            <T>output.html</T>
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleRefresh}
          disabled={appHtml.isFetching}
          aria-label={t("Refresh Agentic-App")}
        >
          {appHtml.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleDownload}
          disabled={isDownloading}
          aria-label={t("Download output.html")}
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
          aria-label={t("Close Agentic-App")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="bg-muted/30 min-h-0 flex-1">
        {appHtml.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        ) : appHtml.isError ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div className="max-w-sm space-y-2">
              {(() => {
                const copy = getAgenticAppErrorCopy(appHtml.error, t);
                return (
                  <>
                    <p className="text-sm font-medium">{copy.title}</p>
                    <p className="text-muted-foreground text-xs">{copy.description}</p>
                  </>
                );
              })()}
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            title={t("output.html Agentic-App")}
            className="bg-background h-full w-full border-0"
            sandbox="allow-scripts allow-forms"
            srcDoc={appHtml.data?.html ?? ""}
            onLoad={handleIframeLoad}
          />
        )}
      </div>
    </div>
  );
}
