"use client";

import { Play, RotateCcw, Shield } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DebugScenarioKey = "approval" | "auth" | "question" | "runtime";

export type ArmedDebugPreset = {
  key: DebugScenarioKey;
  label: string;
  prompt: string;
  debugRunDeadlineMs?: number;
  debugApprovalHotWaitMs?: number;
};

export type ChatDebugSnapshot = {
  conversationId?: string | null;
  generationId?: string | null;
  runtimeId?: string | null;
  sandboxProvider?: "e2b" | "daytona" | "docker" | null;
  sandboxId?: string | null;
  sessionId?: string | null;
  status?: string | null;
  pauseReason?: string | null;
  lastParkedStatus?: string | null;
  releasedSandboxId?: string | null;
};

type Props = {
  armedPreset: ArmedDebugPreset | null;
  snapshot: ChatDebugSnapshot;
  disabled?: boolean;
  onArmPreset: (preset: ArmedDebugPreset) => void;
  onClearPreset: () => void;
  onResumeRunDeadline: () => void;
  isResumingRunDeadline?: boolean;
};

const DEFAULT_APPROVAL_SECONDS = "5";
const DEFAULT_AUTH_SECONDS = "5";
const DEFAULT_QUESTION_SECONDS = "5";
const DEFAULT_RUNTIME_SECONDS = "30";

const PROMPTS: Record<DebugScenarioKey, string> = {
  approval: "send a message on slack #experiment-cmdclaw-testing saying hi",
  auth: "Use the Notion integration to list my first 5 Notion databases by name. Do not use any other source.",
  question:
    "Use the question tool exactly once with header 'Pick', question 'Choose one', and options 'Alpha' and 'Beta'. After I answer, respond exactly as SELECTED=<answer>.",
  runtime:
    "analyze my last 30 emails and classify them as urgent with a summary of next action point to do",
};

function coerceSeconds(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function formatSandbox(snapshot: ChatDebugSnapshot): string {
  if (!snapshot.sandboxId) {
    return "-";
  }
  return snapshot.sandboxProvider
    ? `${snapshot.sandboxProvider}:${snapshot.sandboxId}`
    : snapshot.sandboxId;
}

function formatStatus(snapshot: ChatDebugSnapshot): string {
  if (!snapshot.status) {
    return "-";
  }
  if (snapshot.pauseReason) {
    return `${snapshot.status} (${snapshot.pauseReason})`;
  }
  return snapshot.status;
}

export function ChatDebugPopover({
  armedPreset,
  snapshot,
  disabled = false,
  onArmPreset,
  onClearPreset,
  onResumeRunDeadline,
  isResumingRunDeadline = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [approvalSeconds, setApprovalSeconds] = useState(DEFAULT_APPROVAL_SECONDS);
  const [authSeconds, setAuthSeconds] = useState(DEFAULT_AUTH_SECONDS);
  const [questionSeconds, setQuestionSeconds] = useState(DEFAULT_QUESTION_SECONDS);
  const [runtimeSeconds, setRuntimeSeconds] = useState(DEFAULT_RUNTIME_SECONDS);

  const handleApprovalSecondsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setApprovalSeconds(event.target.value);
  }, []);
  const handleAuthSecondsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setAuthSeconds(event.target.value);
  }, []);
  const handleQuestionSecondsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setQuestionSeconds(event.target.value);
  }, []);
  const handleRuntimeSecondsChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setRuntimeSeconds(event.target.value);
  }, []);

  const handleArmApproval = useCallback(() => {
    const seconds = coerceSeconds(approvalSeconds, 5);
    onArmPreset({
      key: "approval",
      label: "Approval",
      prompt: PROMPTS.approval,
      debugApprovalHotWaitMs: seconds * 1000,
    });
    setOpen(false);
  }, [approvalSeconds, onArmPreset]);

  const handleArmAuth = useCallback(() => {
    const seconds = coerceSeconds(authSeconds, 5);
    onArmPreset({
      key: "auth",
      label: "Auth",
      prompt: PROMPTS.auth,
      debugApprovalHotWaitMs: seconds * 1000,
    });
    setOpen(false);
  }, [authSeconds, onArmPreset]);

  const handleArmQuestion = useCallback(() => {
    const seconds = coerceSeconds(questionSeconds, 5);
    onArmPreset({
      key: "question",
      label: "Question",
      prompt: PROMPTS.question,
      debugApprovalHotWaitMs: seconds * 1000,
    });
    setOpen(false);
  }, [onArmPreset, questionSeconds]);

  const handleArmRuntime = useCallback(() => {
    const seconds = coerceSeconds(runtimeSeconds, 30);
    onArmPreset({
      key: "runtime",
      label: "Runtime",
      prompt: PROMPTS.runtime,
      debugRunDeadlineMs: seconds * 1000,
    });
    setOpen(false);
  }, [onArmPreset, runtimeSeconds]);

  const handleResumeClick = useCallback(() => {
    onResumeRunDeadline();
    setOpen(false);
  }, [onResumeRunDeadline]);

  const canResumeRunDeadline =
    snapshot.status === "paused" &&
    snapshot.pauseReason === "run_deadline" &&
    typeof snapshot.generationId === "string" &&
    snapshot.generationId.length > 0 &&
    !disabled;

  const infoRows = useMemo(
    () => [
      { label: "Conversation", value: snapshot.conversationId ?? "-" },
      { label: "Generation", value: snapshot.generationId ?? "-" },
      { label: "Runtime", value: snapshot.runtimeId ?? "-" },
      { label: "Sandbox", value: formatSandbox(snapshot) },
      { label: "Status", value: formatStatus(snapshot) },
      {
        label: "Last parked",
        value:
          snapshot.lastParkedStatus && snapshot.releasedSandboxId
            ? `${snapshot.lastParkedStatus} (${snapshot.releasedSandboxId})`
            : (snapshot.lastParkedStatus ?? "-"),
      },
    ],
    [snapshot],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={armedPreset ? "secondary" : "ghost"}
          size="sm"
          disabled={disabled}
          className="h-9 w-9 rounded-xl p-0"
          aria-label={
            armedPreset
              ? `Admin debug controls (${armedPreset.label} armed)`
              : "Admin debug controls"
          }
          title={armedPreset ? `Debug: ${armedPreset.label}` : "Admin debug controls"}
        >
          <Shield className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={8} className="w-[360px] p-3">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Recovery Presets</div>
            <p className="text-muted-foreground text-xs">
              Admin-only debug controls for approval, auth, and runtime recovery.
            </p>
          </div>

          <div className="space-y-2">
            <div className="rounded-lg border p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Approval Recovery</div>
                  <div className="text-muted-foreground text-xs">Slack write approval repro</div>
                </div>
                <Button type="button" size="sm" className="h-8" onClick={handleArmApproval}>
                  Arm
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={approvalSeconds}
                  onChange={handleApprovalSecondsChange}
                  className="h-8"
                />
                <span className="text-muted-foreground text-xs">seconds before park</span>
              </div>
            </div>

            <div className="rounded-lg border p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Auth Recovery</div>
                  <div className="text-muted-foreground text-xs">
                    Disconnected Notion auth repro
                  </div>
                </div>
                <Button type="button" size="sm" className="h-8" onClick={handleArmAuth}>
                  Arm
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={authSeconds}
                  onChange={handleAuthSecondsChange}
                  className="h-8"
                />
                <span className="text-muted-foreground text-xs">seconds before park</span>
              </div>
            </div>

            <div className="rounded-lg border p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Question Recovery</div>
                  <div className="text-muted-foreground text-xs">Runtime question repro</div>
                </div>
                <Button type="button" size="sm" className="h-8" onClick={handleArmQuestion}>
                  Arm
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={questionSeconds}
                  onChange={handleQuestionSecondsChange}
                  className="h-8"
                />
                <span className="text-muted-foreground text-xs">seconds before park</span>
              </div>
            </div>

            <div className="rounded-lg border p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Runtime Deadline</div>
                  <div className="text-muted-foreground text-xs">Long Gmail analysis repro</div>
                </div>
                <Button type="button" size="sm" className="h-8" onClick={handleArmRuntime}>
                  Arm
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={runtimeSeconds}
                  onChange={handleRuntimeSecondsChange}
                  className="h-8"
                />
                <span className="text-muted-foreground text-xs">seconds before deadline</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Current Debug State</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={onClearPreset}
                disabled={!armedPreset}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
            <div className="space-y-1.5">
              {infoRows.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{row.label}</span>
                  <code className="max-w-[220px] text-right break-all">{row.value}</code>
                </div>
              ))}
            </div>

            <div className={cn("mt-3", !canResumeRunDeadline && "hidden")}>
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={handleResumeClick}
                disabled={!canResumeRunDeadline || isResumingRunDeadline}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {isResumingRunDeadline ? "Resuming..." : "Resume Paused Runtime"}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
