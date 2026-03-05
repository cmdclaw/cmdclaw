"use client";

import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { WORKFLOW_AVAILABLE_INTEGRATION_TYPES } from "@/lib/integration-icons";
import { cn } from "@/lib/utils";
import { getWorkflowRunStatusLabel } from "@/lib/workflow-status";
import { useCreateWorkflow, useWorkflowList } from "@/orpc/hooks";

type WorkflowItem = {
  id: string;
  name?: string | null;
  status: "on" | "off";
  triggerType: string;
  recentRuns?: { id: string; status: string; startedAt?: Date | string | null; source?: string }[];
};

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

export default function WorkflowsPage() {
  const { data: workflows, isLoading } = useWorkflowList();
  const createWorkflow = useCreateWorkflow();
  const [isCreatingBuilder, setIsCreatingBuilder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workflowList = useMemo(() => (Array.isArray(workflows) ? workflows : []), [workflows]);

  const handleOpenBuilderAgent = useCallback(async () => {
    if (isCreatingBuilder) {
      return;
    }
    setIsCreatingBuilder(true);
    setError(null);

    try {
      const result = await createWorkflow.mutateAsync({
        name: "",
        triggerType: "manual",
        prompt: "",
        allowedIntegrations: WORKFLOW_AVAILABLE_INTEGRATION_TYPES,
      });
      window.location.href = `/workflows/${result.id}`;
    } catch {
      setError("Failed to open workflow builder. Please try again.");
      setIsCreatingBuilder(false);
    }
  }, [createWorkflow, isCreatingBuilder]);

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold">My Workflows</h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {workflowList.length === 0
              ? "No workflows yet"
              : `${workflowList.length} workflow${workflowList.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href="/workflows/grid">Grid View</Link>
          </Button>
          <Button onClick={handleOpenBuilderAgent} disabled={isCreatingBuilder} className="gap-1.5">
            {isCreatingBuilder ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Workflow Builder Agent
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      ) : workflowList.length === 0 ? (
        <div className="border-border/40 rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            No workflows yet. Use "Workflow Builder Agent" to create one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflowList.map((wf) => (
            <WorkflowCard key={wf.id} workflow={wf} />
          ))}
        </div>
      )}
    </div>
  );
}
