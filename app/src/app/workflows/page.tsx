"use client";

import { ArrowUp, Loader2, PenLine, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IntegrationType } from "@/lib/integration-icons";
import { Button } from "@/components/ui/button";
import {
  INTEGRATION_LOGOS,
  INTEGRATION_DISPLAY_NAMES,
  WORKFLOW_AVAILABLE_INTEGRATION_TYPES,
} from "@/lib/integration-icons";
import { cn } from "@/lib/utils";
import { getWorkflowRunStatusLabel } from "@/lib/workflow-status";
import { client } from "@/orpc/client";
import { useCreateWorkflow, useWorkflowList } from "@/orpc/hooks";

type WorkflowItem = {
  id: string;
  name?: string | null;
  username?: string | null;
  description?: string | null;
  status: "on" | "off";
  triggerType: string;
  integrations?: IntegrationType[];
  recentRuns?: { id: string; status: string; startedAt?: Date | string | null; source?: string }[];
};

const DEFAULT_WORKFLOW_BUILDER_MODEL = "anthropic/claude-sonnet-4-6";

// ─── Mock workflows (for development) ────────────────────────────────────────

const MOCK_WORKFLOWS: WorkflowItem[] = [
  {
    id: "mock-daily-digest",
    name: "Morning email digest",
    username: "daily_digest",
    description:
      "Summarizes unread emails from the last 24 hours and sends a clean digest with action items every morning at 8am.",
    status: "on",
    triggerType: "schedule",
    integrations: ["gmail"],
    recentRuns: [{ id: "r1", status: "completed", startedAt: new Date(Date.now() - 3600000) }],
  },
  {
    id: "mock-lead-enrichment",
    name: "Lead enrichment pipeline",
    username: "lead_enricher",
    description:
      "Processes new rows from Google Sheets, finds decision-makers on LinkedIn, enriches contact data, and pushes to HubSpot.",
    status: "on",
    triggerType: "manual",
    integrations: ["google_sheets", "linkedin", "hubspot"],
    recentRuns: [{ id: "r2", status: "completed", startedAt: new Date(Date.now() - 86400000) }],
  },
  {
    id: "mock-meeting-prep",
    name: "Pre-meeting briefing",
    username: "meeting_brief_bot",
    description:
      "When a new meeting is booked, researches the person and company on LinkedIn, checks HubSpot for history, and posts a briefing to Slack.",
    status: "on",
    triggerType: "webhook",
    integrations: ["google_calendar", "linkedin", "hubspot", "slack"],
    recentRuns: [{ id: "r3", status: "running", startedAt: new Date(Date.now() - 300000) }],
  },
  {
    id: "mock-incident-alert",
    name: "GitHub incident alerts",
    username: "incident_watch",
    description:
      "When a critical issue is opened on GitHub, gathers related PRs and recent commits, then posts a rich summary to the #incidents Slack channel.",
    status: "off",
    triggerType: "webhook",
    integrations: ["github", "slack"],
    recentRuns: [],
  },
  {
    id: "mock-campaign-report",
    name: "Weekly campaign report",
    username: "campaign_reporter",
    description:
      "Every Monday, pulls campaign metrics from HubSpot and Google Sheets, generates a performance summary, and posts to Slack.",
    status: "on",
    triggerType: "schedule",
    integrations: ["hubspot", "google_sheets", "slack"],
    recentRuns: [{ id: "r4", status: "completed", startedAt: new Date(Date.now() - 604800000) }],
  },
  {
    id: "mock-churn-detection",
    name: "Churn risk monitor",
    username: "churn_sentinel",
    description:
      "Monitors usage data and support tickets daily. When churn risk is detected, notifies the CS team in Slack with full context and suggested actions.",
    status: "on",
    triggerType: "schedule",
    integrations: ["hubspot", "slack", "gmail"],
    recentRuns: [{ id: "r5", status: "completed", startedAt: new Date(Date.now() - 172800000) }],
  },
];

function formatDate(value?: Date | string | null) {
  if (!value) {
    return null;
  }
  const date = typeof value === "string" ? new Date(value) : value;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) {
    return "just now";
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffH < 24) {
    return `${diffH}h ago`;
  }
  if (diffD < 7) {
    return `${diffD}d ago`;
  }
  return date.toLocaleDateString();
}

function getTriggerLabel(triggerType: string) {
  const map: Record<string, string> = {
    manual: "Manual",
    schedule: "Scheduled",
    email: "Email",
    webhook: "Webhook",
  };
  return map[triggerType] ?? triggerType;
}

function getWorkflowDisplayName(name?: string | null) {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "New Workflow";
}

function WorkflowCard({
  workflow,
  onRun,
  onOpen,
}: {
  workflow: WorkflowItem;
  onRun: (workflow: WorkflowItem) => void;
  onOpen: (id: string) => void;
}) {
  const isOn = workflow.status === "on";
  const recentRun = Array.isArray(workflow.recentRuns) ? workflow.recentRuns[0] : null;

  const handleRun = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onRun(workflow);
    },
    [onRun, workflow],
  );
  const handleOpen = useCallback(() => {
    onOpen(workflow.id);
  }, [onOpen, workflow.id]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" && e.key !== " ") {
        return;
      }
      e.preventDefault();
      onOpen(workflow.id);
    },
    [onOpen, workflow.id],
  );

  const integrations = workflow.integrations ?? [];

  return (
    <div
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      className="border-border/40 bg-card hover:border-border hover:bg-muted/30 group flex min-h-[180px] cursor-pointer flex-col gap-3 rounded-xl border p-5 shadow-sm transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm leading-tight font-medium">
            {getWorkflowDisplayName(workflow.name)}
          </p>
          {workflow.username ? (
            <p className="text-muted-foreground bg-muted/60 inline-flex rounded-full px-2 py-0.5 font-mono text-[10px]">
              @{workflow.username}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "mt-0.5 size-2 rounded-full",
              isOn ? "bg-green-500" : "bg-muted-foreground/30",
            )}
          />
          <span className="text-muted-foreground text-xs">{isOn ? "On" : "Off"}</span>
        </div>
      </div>

      {workflow.description && (
        <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
          {workflow.description}
        </p>
      )}

      <div className="flex items-center gap-2">
        <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
          {getTriggerLabel(workflow.triggerType)}
        </span>
        {integrations.length > 0 && (
          <div className="flex items-center gap-1">
            {integrations.map((key) => {
              const logo = INTEGRATION_LOGOS[key];
              if (!logo) {
                return null;
              }
              return (
                <Image
                  key={key}
                  src={logo}
                  alt={INTEGRATION_DISPLAY_NAMES[key] ?? key}
                  width={14}
                  height={14}
                  className="size-3.5 shrink-0"
                  title={INTEGRATION_DISPLAY_NAMES[key] ?? key}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="text-muted-foreground/70 text-xs">
        {recentRun ? (
          <span>
            Last run:{" "}
            <span className="text-muted-foreground">
              {getWorkflowRunStatusLabel(recentRun.status)}
            </span>{" "}
            · {formatDate(recentRun.startedAt) ?? "—"}
          </span>
        ) : (
          <span>No runs yet</span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-1.5 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleRun}
          disabled={!workflow.username}
        >
          <Play className="size-3" />
          Run
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" asChild>
          <Link href={`/workflows/${workflow.id}`}>
            <PenLine className="size-3" />
            Edit
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const router = useRouter();
  const { data: workflows, isLoading } = useWorkflowList();
  const createWorkflow = useCreateWorkflow();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workflowList = useMemo(() => {
    const real = Array.isArray(workflows) ? workflows : [];
    // Merge mock data with real workflows for development
    return [...real, ...MOCK_WORKFLOWS];
  }, [workflows]);

  useEffect(() => {
    if (!error) {
      return;
    }
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleRunWorkflow = useCallback(
    (workflow: WorkflowItem) => {
      const username = workflow.username?.trim();
      if (!username) {
        setError("Missing workflow username.");
        return;
      }
      const query = new URLSearchParams({ prefill: `run @workflow-${username}` });
      router.push(`/chat?${query.toString()}`);
    },
    [router],
  );
  const handleOpenWorkflow = useCallback(
    (id: string) => {
      router.push(`/workflows/${id}`);
    },
    [router],
  );

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const doCreate = useCallback(
    async (initialMessage: string) => {
      const result = await createWorkflow.mutateAsync({
        name: "",
        triggerType: "manual",
        prompt: "",
        allowedIntegrations: WORKFLOW_AVAILABLE_INTEGRATION_TYPES,
      });

      const text = initialMessage.trim();
      if (text) {
        try {
          const { conversationId } = await client.workflow.getOrCreateBuilderConversation({
            id: result.id,
          });
          await client.generation.startGeneration({
            conversationId,
            content: text,
            model: DEFAULT_WORKFLOW_BUILDER_MODEL,
            autoApprove: true,
          });
        } catch (builderError) {
          console.error("Failed to start workflow builder generation:", builderError);
        }
      }

      window.location.href = `/workflows/${result.id}`;
    },
    [createWorkflow],
  );

  const handlePromptSubmit = useCallback(async () => {
    const text = prompt.trim();
    if (!text || isCreating) {
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      await doCreate(text);
    } catch {
      setError("Failed to create workflow. Please try again.");
      setIsCreating(false);
    }
  }, [doCreate, isCreating, prompt]);

  const handlePromptKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handlePromptSubmit();
      }
    },
    [handlePromptSubmit],
  );

  return (
    <div className="space-y-10">
      {error ? (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      ) : null}

      <div className="px-4 pt-[12vh] pb-8">
        <div className="mx-auto max-w-xl">
          <h1 className="text-foreground mb-2 text-center text-xl font-semibold tracking-tight">
            What do you want to automate?
          </h1>
          <p className="text-muted-foreground mb-6 text-center text-sm">
            Describe a task and we&apos;ll build it step by step
          </p>
          <div className="border-border/50 bg-card rounded-2xl border p-4 shadow-sm">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={handlePromptKeyDown}
              placeholder="e.g. Every morning, summarize my unread emails and send me a digest…"
              rows={2}
              className="placeholder:text-muted-foreground/80 text-foreground min-h-12 w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-muted-foreground/40 text-xs">⌘ Enter to send</p>
              <Button
                size="sm"
                onClick={handlePromptSubmit}
                disabled={!prompt.trim() || isCreating}
                className="gap-1.5 rounded-lg px-3"
              >
                {isCreating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="size-3.5" />
                )}
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      ) : workflowList.length === 0 ? (
        <div className="border-border/40 rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">No workflows yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {workflowList.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onRun={handleRunWorkflow}
              onOpen={handleOpenWorkflow}
            />
          ))}
        </div>
      )}
    </div>
  );
}
