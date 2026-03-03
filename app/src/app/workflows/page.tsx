"use client";

import { Loader2, ArrowUp, CheckCircle2, XCircle, Plus } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IntegrationType } from "@/lib/integration-icons";
import { Button } from "@/components/ui/button";
import { WORKFLOW_AVAILABLE_INTEGRATION_TYPES, INTEGRATION_LOGOS } from "@/lib/integration-icons";
import { cn } from "@/lib/utils";
import { getWorkflowRunStatusLabel } from "@/lib/workflow-status";
import { client } from "@/orpc/client";
import { useWorkflowList, useCreateWorkflow } from "@/orpc/hooks";

type WorkflowItem = {
  id: string;
  name?: string | null;
  status: "on" | "off";
  triggerType: string;
  recentRuns?: { id: string; status: string; startedAt?: Date | string | null; source?: string }[];
};

const DEFAULT_WORKFLOW_BUILDER_MODEL = "anthropic/claude-sonnet-4-6";

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Templates ──────────────────────────────────────────────────────────────

type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  triggerType: "manual" | "schedule" | "email" | "webhook";
  integrations: IntegrationType[];
  prompt: string;
};

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "daily-email-digest",
    name: "Daily Email Digest",
    description: "Summarize unread emails every morning into a clean briefing",
    triggerType: "schedule",
    integrations: ["gmail"],
    prompt:
      "Every morning at 8am, read my unread emails from the last 24 hours, summarize the most important ones, and send me a digest email with key action items.",
  },
  {
    id: "github-pr-slack",
    name: "PR Alert to Slack",
    description: "Post new GitHub pull requests to a Slack channel automatically",
    triggerType: "webhook",
    integrations: ["github", "slack"],
    prompt:
      "When a new pull request is opened in my repository, post a summary to the #engineering Slack channel including the PR title, author, and description.",
  },
  {
    id: "meeting-notes-notion",
    name: "Meeting Notes to Notion",
    description: "After calendar events, create structured notes pages in Notion",
    triggerType: "schedule",
    integrations: ["google_calendar", "notion"],
    prompt:
      "After each calendar event ends, create a Notion page with the meeting title, attendees, and a template for notes and action items.",
  },
  {
    id: "lead-to-hubspot",
    name: "Email Lead to HubSpot",
    description: "Capture leads from email and create HubSpot contacts automatically",
    triggerType: "email",
    integrations: ["gmail", "hubspot"],
    prompt:
      "When I receive an email from a potential lead, extract their contact information and create a new contact in HubSpot with relevant notes.",
  },
  {
    id: "weekly-report",
    name: "Weekly Sheets Report",
    description: "Generate and email a weekly report from your spreadsheet data",
    triggerType: "schedule",
    integrations: ["google_sheets", "gmail"],
    prompt:
      "Every Friday at 5pm, read the weekly metrics from my Google Sheets, generate a summary report, and email it to my team.",
  },
  {
    id: "slack-digest",
    name: "Slack Channel Digest",
    description: "Daily summary of key Slack conversations sent to your inbox",
    triggerType: "schedule",
    integrations: ["slack", "gmail"],
    prompt:
      "Every evening, summarize the most important conversations and decisions from my Slack channels and send me a digest email.",
  },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function IntegrationLogos({ integrations }: { integrations: IntegrationType[] }) {
  return (
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
            alt={key}
            width={16}
            height={16}
            className="size-4 shrink-0"
          />
        );
      })}
    </div>
  );
}

function TemplateCard({
  template,
  onSelect,
  loading,
}: {
  template: WorkflowTemplate;
  onSelect: (t: WorkflowTemplate) => void;
  loading: boolean;
}) {
  const handleClick = useCallback(() => {
    onSelect(template);
  }, [onSelect, template]);

  return (
    <button
      className={cn(
        "group border-border/40 bg-card hover:border-border hover:bg-muted/30 relative flex w-full flex-col gap-3 rounded-xl border p-4 text-left shadow-sm transition-all duration-150",
        loading && "pointer-events-none opacity-60",
      )}
      onClick={handleClick}
      disabled={loading}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm leading-tight font-medium">{template.name}</p>
          <span className="bg-muted text-muted-foreground mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
            {getTriggerLabel(template.triggerType)}
          </span>
        </div>
        <ArrowUp className="text-muted-foreground/40 group-hover:text-muted-foreground mt-0.5 size-3.5 shrink-0 rotate-45 transition-colors" />
      </div>
      <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
        {template.description}
      </p>
      <div className="mt-auto pt-1">
        <IntegrationLogos integrations={template.integrations} />
      </div>
    </button>
  );
}

function WorkflowCard({ workflow }: { workflow: WorkflowItem }) {
  const isOn = workflow.status === "on";
  const recentRun = Array.isArray(workflow.recentRuns) ? workflow.recentRuns[0] : null;

  return (
    <a
      href={`/workflows/${workflow.id}`}
      className="border-border/40 bg-card hover:border-border hover:bg-muted/30 group flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-all duration-150"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-tight font-medium">{getWorkflowDisplayName(workflow.name)}</p>
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

      <div className="flex items-center gap-2">
        <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
          {getTriggerLabel(workflow.triggerType)}
        </span>
      </div>

      <div className="text-muted-foreground/70 mt-auto text-xs">
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
    </a>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const { data: workflows, isLoading } = useWorkflowList();
  const createWorkflow = useCreateWorkflow();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!notification) {
      return;
    }
    const timer = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Auto-resize textarea
  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const doCreate = useCallback(
    async (opts: { prompt: string; triggerType?: string; initialMessage?: string }) => {
      try {
        const result = await createWorkflow.mutateAsync({
          name: "",
          triggerType:
            (opts.triggerType as "manual" | "schedule" | "email" | "webhook") ?? "manual",
          prompt: opts.prompt,
          allowedIntegrations: WORKFLOW_AVAILABLE_INTEGRATION_TYPES,
        });

        const initialMessage = opts.initialMessage?.trim();
        if (initialMessage) {
          try {
            const { conversationId } = await client.workflow.getOrCreateBuilderConversation({
              id: result.id,
            });
            await client.generation.startGeneration({
              conversationId,
              content: initialMessage,
              model: DEFAULT_WORKFLOW_BUILDER_MODEL,
              autoApprove: true,
            });
          } catch (error) {
            console.error("Failed to start workflow builder generation:", error);
          }
        }

        window.location.href = `/workflows/${result.id}`;
      } catch {
        setNotification({ type: "error", message: "Failed to create workflow. Please try again." });
        return false;
      }
      return true;
    },
    [createWorkflow],
  );

  const handlePromptSubmit = useCallback(async () => {
    const text = prompt.trim();
    if (!text || isCreating) {
      return;
    }
    setIsCreating(true);
    await doCreate({ prompt: "", initialMessage: text });
    setIsCreating(false);
  }, [doCreate, isCreating, prompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handlePromptSubmit();
      }
    },
    [handlePromptSubmit],
  );

  const handleTemplateSelect = useCallback(
    async (template: WorkflowTemplate) => {
      if (creatingTemplateId) {
        return;
      }
      setCreatingTemplateId(template.id);
      await doCreate({ prompt: template.prompt, triggerType: template.triggerType });
      setCreatingTemplateId(null);
    },
    [creatingTemplateId, doCreate],
  );

  const handleCreateBlank = useCallback(async () => {
    if (isCreating) {
      return;
    }
    setIsCreating(true);
    await doCreate({ prompt: "", triggerType: "manual" });
    setIsCreating(false);
  }, [doCreate, isCreating]);

  const workflowList = Array.isArray(workflows) ? workflows : [];

  return (
    <div>
      {notification && (
        <div
          className={cn(
            "mb-6 flex items-center gap-2 rounded-lg border p-4",
            notification.type === "success"
              ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400",
          )}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 shrink-0" />
          )}
          {notification.message}
        </div>
      )}

      {/* ── Prompt area — centered hero ── */}
      <div className="px-4 pt-16 pb-12">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-foreground mb-2 text-center text-xl font-semibold tracking-tight">
            What do you want to automate?
          </h1>
          <p className="text-muted-foreground mb-6 text-center text-sm">
            Describe a task and we'll build it step by step
          </p>
          <div className="border-border/50 bg-card rounded-2xl border p-4 shadow-sm">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Every morning, summarize my unread emails and send me a digest…"
              rows={2}
              className="placeholder:text-muted-foreground/50 min-h-12 w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
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

      <div className="space-y-10">
        {/* ── My Workflows ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">My Workflows</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {workflowList.length === 0
                  ? "No workflows yet"
                  : `${workflowList.length} workflow${workflowList.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateBlank}
              disabled={isCreating}
              className="gap-1.5"
            >
              {isCreating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              New
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="text-muted-foreground size-5 animate-spin" />
            </div>
          ) : workflowList.length === 0 ? (
            <div className="border-border/40 rounded-xl border border-dashed p-10 text-center">
              <p className="text-muted-foreground text-sm">
                Describe a workflow above or pick a template to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {workflowList.map((wf) => (
                <WorkflowCard key={wf.id} workflow={wf} />
              ))}
            </div>
          )}
        </section>

        {/* ── Templates ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Templates</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Start from a pre-built workflow
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKFLOW_TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={handleTemplateSelect}
                loading={creatingTemplateId === template.id}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
