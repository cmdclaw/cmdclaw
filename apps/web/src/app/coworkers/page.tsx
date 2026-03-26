"use client";

import type { ProviderAuthSource } from "@cmdclaw/core/lib/provider-auth-source";
import { DEFAULT_CONNECTED_CHATGPT_MODEL } from "@cmdclaw/core/lib/chat-model-defaults";
import { type CoworkerToolAccessMode } from "@cmdclaw/core/lib/coworker-tool-policy";
import { Download, Eye, Loader2, PenLine, Play, Power, Share2, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { IntegrationType } from "@/lib/integration-icons";
import { ModelSelector } from "@/components/chat/model-selector";
import { VoiceIndicator } from "@/components/chat/voice-indicator";
import { PromptBar } from "@/components/prompt-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { blobToBase64, useVoiceRecording } from "@/hooks/use-voice-recording";
import { normalizeChatModelSelection } from "@/lib/chat-model-selection";
import { getCoworkerRunStatusLabel } from "@/lib/coworker-status";
import { normalizeGenerationError } from "@/lib/generation-errors";
import {
  INTEGRATION_LOGOS,
  INTEGRATION_DISPLAY_NAMES,
  COWORKER_AVAILABLE_INTEGRATION_TYPES,
} from "@/lib/integration-icons";
import { buildProviderAuthAvailabilityByProvider } from "@/lib/provider-auth-availability";
import { cn } from "@/lib/utils";
import { client } from "@/orpc/client";
import {
  useCreateCoworker,
  useCoworkerList,
  useDeleteCoworker,
  useExportCoworkerDefinition,
  useImportCoworkerDefinition,
  useImportSharedCoworker,
  useIntegrationList,
  useProviderAuthStatus,
  useShareCoworker,
  useSharedCoworkerList,
  useTranscribe,
  useTriggerCoworker,
  useUnshareCoworker,
  useUpdateCoworker,
} from "@/orpc/hooks";

type CoworkerItem = {
  id: string;
  name?: string | null;
  username?: string | null;
  description?: string | null;
  status: "on" | "off";
  triggerType: string;
  toolAccessMode: CoworkerToolAccessMode;
  allowedIntegrations?: IntegrationType[];
  allowedSkillSlugs?: string[];
  recentRuns?: {
    id: string;
    status: string;
    startedAt?: Date | string | null;
    conversationId?: string | null;
    source?: string;
  }[];
  sharedAt?: Date | string | null;
};

type SharedCoworkerItem = {
  id: string;
  name?: string | null;
  description?: string | null;
  triggerType: string;
  toolAccessMode: CoworkerToolAccessMode;
  allowedIntegrations?: IntegrationType[];
  allowedSkillSlugs?: string[];
  prompt?: string | null;
  owner: {
    name?: string | null;
    email?: string | null;
  };
  sharedAt?: Date | string | null;
  documentCount: number;
  isOwnedByCurrentUser: boolean;
};

const DEFAULT_COWORKER_BUILDER_MODEL = DEFAULT_CONNECTED_CHATGPT_MODEL;
const MAX_VISIBLE_TOOL_INDICATORS = 3;

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

function getCoworkerDisplayName(name?: string | null) {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "New Coworker";
}

function getCoworkerExportFilename(coworker: Pick<CoworkerItem, "name" | "username">) {
  const baseLabel = coworker.username?.trim() || coworker.name?.trim() || "coworker";
  const slug = baseLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "coworker"}.json`;
}

function downloadCoworkerDefinition(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildToolSummary(
  coworker: Pick<CoworkerItem, "toolAccessMode" | "allowedIntegrations" | "allowedSkillSlugs">,
  connectedIntegrationTypes: IntegrationType[],
) {
  const integrationTypes =
    coworker.toolAccessMode === "all"
      ? connectedIntegrationTypes
      : (coworker.allowedIntegrations ?? []).filter((entry) =>
          COWORKER_AVAILABLE_INTEGRATION_TYPES.includes(entry),
        );
  const skillCount =
    coworker.toolAccessMode === "selected" ? (coworker.allowedSkillSlugs?.length ?? 0) : 0;
  const visibleIntegrations = integrationTypes.slice(0, MAX_VISIBLE_TOOL_INDICATORS);
  const remainingSlots = MAX_VISIBLE_TOOL_INDICATORS - visibleIntegrations.length;
  const showSkillBadge = skillCount > 0 && remainingSlots > 0;
  const coveredCount = visibleIntegrations.length + (showSkillBadge ? skillCount : 0);
  const totalCount = integrationTypes.length + skillCount;

  return {
    visibleIntegrations,
    skillCount,
    showSkillBadge,
    overflowCount: Math.max(0, totalCount - coveredCount),
  };
}

function CoworkerCard({
  coworker,
  connectedIntegrationTypes,
  isRunning,
  isUpdatingStatus,
  isUpdatingShare,
  isExporting,
  isDeleting,
  onRun,
  onOpen,
  onToggleStatus,
  onToggleShare,
  onExport,
  onDelete,
}: {
  coworker: CoworkerItem;
  connectedIntegrationTypes: IntegrationType[];
  isRunning: boolean;
  isUpdatingStatus: boolean;
  isUpdatingShare: boolean;
  isExporting: boolean;
  isDeleting: boolean;
  onRun: (coworker: CoworkerItem) => void;
  onOpen: (id: string) => void;
  onToggleStatus: (coworker: CoworkerItem) => void;
  onToggleShare: (coworker: CoworkerItem) => void;
  onExport: (coworker: CoworkerItem) => void;
  onDelete: (coworker: CoworkerItem) => void;
}) {
  const isOn = coworker.status === "on";
  const recentRun = Array.isArray(coworker.recentRuns) ? coworker.recentRuns[0] : null;
  const toolSummary = useMemo(
    () => buildToolSummary(coworker, connectedIntegrationTypes),
    [connectedIntegrationTypes, coworker],
  );

  const handleRun = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onRun(coworker);
    },
    [onRun, coworker],
  );
  const handleOpen = useCallback(() => {
    onOpen(coworker.id);
  }, [onOpen, coworker.id]);
  const handleToggleStatus = useCallback(() => {
    onToggleStatus(coworker);
  }, [coworker, onToggleStatus]);
  const handleDelete = useCallback(() => {
    onDelete(coworker);
  }, [coworker, onDelete]);
  const handleToggleShare = useCallback(() => {
    onToggleShare(coworker);
  }, [coworker, onToggleShare]);
  const handleExport = useCallback(() => {
    onExport(coworker);
  }, [coworker, onExport]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" && e.key !== " ") {
        return;
      }
      e.preventDefault();
      onOpen(coworker.id);
    },
    [onOpen, coworker.id],
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          tabIndex={0}
          onClick={handleOpen}
          onKeyDown={handleKeyDown}
          className="border-border/40 bg-card hover:border-border hover:bg-muted/30 group flex min-h-[180px] cursor-pointer flex-col gap-3 rounded-xl border p-5 shadow-sm transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <p className="text-sm leading-tight font-medium">
                {getCoworkerDisplayName(coworker.name)}
              </p>
              {coworker.username ? (
                <p className="text-muted-foreground bg-muted/60 inline-flex rounded-full px-2 py-0.5 font-mono text-[10px]">
                  @{coworker.username}
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

          {coworker.description && (
            <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
              {coworker.description}
            </p>
          )}

          <div className="flex items-center gap-2">
            <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
              {getTriggerLabel(coworker.triggerType)}
            </span>
            {coworker.sharedAt ? (
              <span className="text-foreground/70 bg-foreground/[0.06] inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
                <Share2 className="size-2.5 opacity-60" />
                Shared
              </span>
            ) : null}
            {toolSummary.visibleIntegrations.length > 0 && (
              <div className="flex items-center gap-1">
                {toolSummary.visibleIntegrations.map((key) => {
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
            {toolSummary.showSkillBadge ? (
              <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
                {toolSummary.skillCount} skill{toolSummary.skillCount === 1 ? "" : "s"}
              </span>
            ) : null}
            {toolSummary.overflowCount > 0 ? (
              <span className="text-muted-foreground inline-flex items-center text-[10px] font-medium">
                +{toolSummary.overflowCount}
              </span>
            ) : null}
          </div>

          <div className="text-muted-foreground/70 text-xs">
            {recentRun ? (
              <span>
                Last run:{" "}
                <span className="text-muted-foreground">
                  {getCoworkerRunStatusLabel(recentRun.status)}
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
              disabled={isRunning}
            >
              {isRunning ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Play className="size-3" />
              )}
              Run
            </Button>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" asChild>
              <Link href={`/coworkers/${coworker.id}`}>
                <PenLine className="size-3" />
                Edit
              </Link>
            </Button>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={handleToggleStatus} disabled={isUpdatingStatus || isDeleting}>
          <Power className="size-4" />
          {isOn ? "Turn off" : "Turn on"}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={handleToggleShare}
          disabled={isUpdatingShare || isDeleting || isUpdatingStatus}
        >
          <Share2 className="size-4" />
          {coworker.sharedAt ? "Unshare from workspace" : "Share with workspace"}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={handleExport}
          disabled={isExporting || isDeleting || isUpdatingStatus}
        >
          <Download className="size-4" />
          Export as JSON
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={handleDelete}
          disabled={isDeleting || isUpdatingStatus}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="size-4" />
          Delete coworker
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SharedCoworkerCard({
  coworker,
  connectedIntegrationTypes,
  isImporting,
  onImport,
}: {
  coworker: SharedCoworkerItem;
  connectedIntegrationTypes: IntegrationType[];
  isImporting: boolean;
  onImport: (id: string) => void;
}) {
  const handleImport = useCallback(() => {
    onImport(coworker.id);
  }, [coworker.id, onImport]);

  const toolSummary = useMemo(
    () => buildToolSummary(coworker, connectedIntegrationTypes),
    [connectedIntegrationTypes, coworker],
  );

  return (
    <div className="border-border/40 bg-card flex min-h-[160px] flex-col gap-3 rounded-xl border p-5 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm leading-tight font-medium">{getCoworkerDisplayName(coworker.name)}</p>
        <p className="text-muted-foreground text-xs">
          Shared by {coworker.owner.name?.trim() || coworker.owner.email || "A teammate"}
        </p>
      </div>
      {coworker.description ? (
        <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
          {coworker.description}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
          {getTriggerLabel(coworker.triggerType)}
        </span>
        {toolSummary.visibleIntegrations.length > 0 && (
          <div className="flex items-center gap-1">
            {toolSummary.visibleIntegrations.map((key) => {
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
        {toolSummary.showSkillBadge ? (
          <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
            {toolSummary.skillCount} skill{toolSummary.skillCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {toolSummary.overflowCount > 0 ? (
          <span className="text-muted-foreground inline-flex items-center text-[10px] font-medium">
            +{toolSummary.overflowCount}
          </span>
        ) : null}
      </div>

      <div className="text-muted-foreground/70 text-xs">
        {coworker.documentCount} document{coworker.documentCount === 1 ? "" : "s"} · shared{" "}
        {formatDate(coworker.sharedAt) ?? "recently"}
      </div>
      <div className="mt-auto flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleImport}
          disabled={isImporting}
        >
          {isImporting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Download className="size-3" />
          )}
          Install
        </Button>
        {coworker.prompt ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <Eye className="size-3" />
                View instructions
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{getCoworkerDisplayName(coworker.name)}</DialogTitle>
                <DialogDescription>
                  Instructions shared by{" "}
                  {coworker.owner.name?.trim() || coworker.owner.email || "a teammate"}
                </DialogDescription>
              </DialogHeader>
              <div className="text-muted-foreground max-h-[400px] overflow-y-auto text-sm whitespace-pre-wrap">
                {coworker.prompt}
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}

export default function CoworkersPage() {
  const router = useRouter();
  const { data: coworkers, isLoading } = useCoworkerList();
  const { data: sharedCoworkers } = useSharedCoworkerList();
  const { data: integrations } = useIntegrationList();
  const { data: providerAuthStatus } = useProviderAuthStatus();
  const createCoworker = useCreateCoworker();
  const triggerCoworker = useTriggerCoworker();
  const updateCoworker = useUpdateCoworker();
  const deleteCoworker = useDeleteCoworker();
  const shareCoworker = useShareCoworker();
  const unshareCoworker = useUnshareCoworker();
  const exportCoworkerDefinition = useExportCoworkerDefinition();
  const importCoworkerDefinition = useImportCoworkerDefinition();
  const importSharedCoworker = useImportSharedCoworker();
  const { isRecording, error: voiceError, startRecording, stopRecording } = useVoiceRecording();
  const { mutateAsync: transcribe } = useTranscribe();
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [inputPrefillRequest, setInputPrefillRequest] = useState<{
    id: string;
    text: string;
    mode?: "replace" | "append";
  } | null>(null);
  const [runningCoworkerId, setRunningCoworkerId] = useState<string | null>(null);
  const [statusCoworkerId, setStatusCoworkerId] = useState<string | null>(null);
  const [shareCoworkerId, setShareCoworkerId] = useState<string | null>(null);
  const [exportingCoworkerId, setExportingCoworkerId] = useState<string | null>(null);
  const [importingSharedCoworkerId, setImportingSharedCoworkerId] = useState<string | null>(null);
  const [deletingCoworkerId, setDeletingCoworkerId] = useState<string | null>(null);
  const [coworkerPendingDelete, setCoworkerPendingDelete] = useState<CoworkerItem | null>(null);
  const [model, setModel] = useState(DEFAULT_COWORKER_BUILDER_MODEL);
  const [modelAuthSource, setModelAuthSource] = useState<ProviderAuthSource | null>("shared");
  const [filterShared, setFilterShared] = useState(false);
  const handleToggleFilterShared = useCallback(() => setFilterShared((v) => !v), []);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const isRecordingRef = useRef(false);
  const coworkerList = useMemo(() => {
    const real = Array.isArray(coworkers) ? coworkers : [];
    return real.map((entry) =>
      Object.assign({}, entry, {
        toolAccessMode: entry.toolAccessMode,
        allowedIntegrations: (entry.allowedIntegrations ?? []) as IntegrationType[],
        allowedSkillSlugs: entry.allowedSkillSlugs ?? [],
      }),
    );
  }, [coworkers]);
  const connectedIntegrationTypes = useMemo(
    () =>
      (integrations ?? []).flatMap((entry) =>
        entry.enabled &&
        entry.setupRequired !== true &&
        COWORKER_AVAILABLE_INTEGRATION_TYPES.includes(entry.type as IntegrationType)
          ? ([entry.type as IntegrationType] as const)
          : [],
      ),
    [integrations],
  );
  const providerAvailability = useMemo(
    () =>
      buildProviderAuthAvailabilityByProvider({
        connectedProviders: providerAuthStatus?.connected,
        sharedConnectedProviders: providerAuthStatus?.shared,
      }),
    [providerAuthStatus],
  );
  const sharedCoworkerList = useMemo(
    () =>
      (sharedCoworkers ?? []).filter(
        (entry) => !entry.isOwnedByCurrentUser,
      ) as SharedCoworkerItem[],
    [sharedCoworkers],
  );
  const sharedByMeCount = useMemo(
    () => coworkerList.filter((c) => c.sharedAt != null).length,
    [coworkerList],
  );
  const displayedCoworkerList = useMemo(
    () => (filterShared ? coworkerList.filter((c) => c.sharedAt != null) : coworkerList),
    [coworkerList, filterShared],
  );

  const handleRunCoworker = useCallback(
    async (coworker: CoworkerItem) => {
      setRunningCoworkerId(coworker.id);
      try {
        const result = await triggerCoworker.mutateAsync({ id: coworker.id, payload: {} });
        toast.success("Run started.");
        router.push(result?.runId ? `/coworkers/runs/${result.runId}` : "/coworkers/runs");
      } catch (error) {
        console.error("Failed to trigger coworker:", error);
        toast.error("Failed to start run.");
      } finally {
        setRunningCoworkerId(null);
      }
    },
    [router, triggerCoworker],
  );
  const handleOpenCoworker = useCallback(
    (id: string) => {
      router.push(`/coworkers/${id}`);
    },
    [router],
  );
  const handleToggleCoworkerStatus = useCallback(
    async (coworker: CoworkerItem) => {
      const nextStatus = coworker.status === "on" ? "off" : "on";
      setStatusCoworkerId(coworker.id);
      try {
        await updateCoworker.mutateAsync({ id: coworker.id, status: nextStatus });
        toast.success(`Coworker turned ${nextStatus}.`);
      } catch (error) {
        console.error("Failed to update coworker status:", error);
        toast.error("Failed to update coworker.");
      } finally {
        setStatusCoworkerId(null);
      }
    },
    [updateCoworker],
  );
  const handleDeleteRequest = useCallback((coworker: CoworkerItem) => {
    setCoworkerPendingDelete(coworker);
  }, []);
  const handleToggleShare = useCallback(
    async (coworker: CoworkerItem) => {
      setShareCoworkerId(coworker.id);
      try {
        if (coworker.sharedAt) {
          await unshareCoworker.mutateAsync(coworker.id);
          toast.success("Coworker unshared.");
        } else {
          await shareCoworker.mutateAsync(coworker.id);
          toast.success("Coworker shared with workspace.");
        }
      } catch (error) {
        console.error("Failed to update coworker sharing:", error);
        toast.error("Failed to update sharing.");
      } finally {
        setShareCoworkerId(null);
      }
    },
    [shareCoworker, unshareCoworker],
  );
  const handleImportSharedCoworker = useCallback(
    async (sourceCoworkerId: string) => {
      setImportingSharedCoworkerId(sourceCoworkerId);
      try {
        const created = await importSharedCoworker.mutateAsync(sourceCoworkerId);
        toast.success("Coworker imported.");
        router.push(`/coworkers/${created.id}`);
      } catch (error) {
        console.error("Failed to import coworker:", error);
        toast.error("Failed to import coworker.");
      } finally {
        setImportingSharedCoworkerId(null);
      }
    },
    [importSharedCoworker, router],
  );
  const handleExportCoworker = useCallback(
    async (coworker: CoworkerItem) => {
      setExportingCoworkerId(coworker.id);
      try {
        const definition = await exportCoworkerDefinition.mutateAsync(coworker.id);
        const json = JSON.stringify(definition, null, 2);
        const filename = getCoworkerExportFilename(coworker);
        downloadCoworkerDefinition(filename, json);
        toast.success(`Exported ${filename}.`);
      } catch (error) {
        console.error("Failed to export coworker:", error);
        toast.error("Failed to export coworker.");
      } finally {
        setExportingCoworkerId(null);
      }
    },
    [exportCoworkerDefinition],
  );
  const handleImportCoworkerClick = useCallback(() => {
    if (importCoworkerDefinition.isPending) {
      return;
    }
    importFileInputRef.current?.click();
  }, [importCoworkerDefinition.isPending]);
  const handleImportCoworkerFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (!file) {
        return;
      }
      if (!file.name.toLowerCase().endsWith(".json")) {
        toast.error("Select a .json coworker export.");
        return;
      }

      try {
        const definitionJson = await file.text();
        const created = await importCoworkerDefinition.mutateAsync(definitionJson);
        toast.success("Coworker imported in the off state.");
        router.push(`/coworkers/${created.id}`);
      } catch (error) {
        console.error("Failed to import coworker definition:", error);
        toast.error("Failed to import coworker.");
      }
    },
    [importCoworkerDefinition, router],
  );
  const handleDeleteDialogChange = useCallback(
    (open: boolean) => {
      if (!open && deletingCoworkerId === null) {
        setCoworkerPendingDelete(null);
      }
    },
    [deletingCoworkerId],
  );
  const handleConfirmDelete = useCallback(async () => {
    if (!coworkerPendingDelete) {
      return;
    }
    setDeletingCoworkerId(coworkerPendingDelete.id);
    try {
      await deleteCoworker.mutateAsync(coworkerPendingDelete.id);
      toast.success("Coworker deleted.");
      setCoworkerPendingDelete(null);
    } catch (error) {
      console.error("Failed to delete coworker:", error);
      toast.error("Failed to delete coworker.");
    } finally {
      setDeletingCoworkerId(null);
    }
  }, [coworkerPendingDelete, deleteCoworker]);

  const stopRecordingAndTranscribe = useCallback(async () => {
    if (!isRecordingRef.current) {
      return;
    }
    isRecordingRef.current = false;

    const audioBlob = await stopRecording();
    if (!audioBlob || audioBlob.size === 0) {
      return;
    }

    setIsProcessingVoice(true);
    try {
      const base64Audio = await blobToBase64(audioBlob);
      const result = await transcribe({
        audio: base64Audio,
        mimeType: audioBlob.type || "audio/webm",
      });

      if (result.text && result.text.trim()) {
        setInputPrefillRequest({
          id: `coworker-voice-prefill-${Date.now()}`,
          text: result.text.trim(),
          mode: "append",
        });
      }
    } catch (error) {
      console.error("Coworker transcription error:", error);
    } finally {
      setIsProcessingVoice(false);
    }
  }, [stopRecording, transcribe]);

  const handleStartRecording = useCallback(() => {
    if (isCreating || isProcessingVoice || isRecordingRef.current) {
      return;
    }

    isRecordingRef.current = true;
    void startRecording();
  }, [isCreating, isProcessingVoice, startRecording]);
  const handleModelChange = useCallback(
    (input: { model: string; authSource?: ProviderAuthSource | null }) => {
      const normalized = normalizeChatModelSelection(input);
      if (!normalized.model) {
        return;
      }

      setModel(normalized.model);
      setModelAuthSource(normalized.authSource);
    },
    [],
  );
  const modelSelectorNode = useMemo(
    () => (
      <ModelSelector
        selectedModel={model}
        selectedAuthSource={modelAuthSource}
        providerAvailability={providerAvailability}
        onSelectionChange={handleModelChange}
        disabled={isCreating || isRecording || isProcessingVoice}
      />
    ),
    [
      handleModelChange,
      isCreating,
      isProcessingVoice,
      isRecording,
      model,
      modelAuthSource,
      providerAvailability,
    ],
  );

  const doCreate = useCallback(
    async ({
      initialMessage,
      name,
      prompt: coworkerPrompt,
      triggerType,
    }: {
      initialMessage?: string;
      name?: string;
      prompt: string;
      triggerType: "manual" | "schedule" | "email" | "webhook";
    }) => {
      const result = await createCoworker.mutateAsync({
        name,
        triggerType,
        prompt: coworkerPrompt,
        model,
        authSource: modelAuthSource,
        toolAccessMode: "all",
        allowedIntegrations: COWORKER_AVAILABLE_INTEGRATION_TYPES,
      });

      const text = initialMessage?.trim() ?? "";
      if (text) {
        try {
          const { conversationId } = await client.coworker.getOrCreateBuilderConversation({
            id: result.id,
          });
          await client.generation.startGeneration({
            conversationId,
            content: text,
            model,
            authSource: modelAuthSource,
            autoApprove: true,
          });
        } catch (builderError) {
          console.error("Failed to start coworker builder generation:", builderError);
          throw builderError;
        }
      }

      window.location.assign(`/coworkers/${result.id}`);
    },
    [createCoworker, model, modelAuthSource],
  );

  const handlePromptSubmit = useCallback(
    async (text: string) => {
      const trimmedText = text.trim();
      if (!trimmedText || isCreating || isProcessingVoice) {
        return;
      }

      setIsCreating(true);
      try {
        await doCreate({
          initialMessage: trimmedText,
          name: "",
          prompt: "",
          triggerType: "manual",
        });
      } catch (error) {
        toast.error(normalizeGenerationError(error, "start_rpc").message);
        setIsCreating(false);
      }
    },
    [doCreate, isCreating, isProcessingVoice],
  );

  return (
    <div className="space-y-10">
      <div className="px-4 pt-[12vh] pb-8">
        <div className="mx-auto max-w-xl">
          <h1 className="text-foreground mb-2 text-center text-xl font-semibold tracking-tight">
            What do you want to automate?
          </h1>
          <p className="text-muted-foreground mb-6 text-center text-sm">
            Describe a task and we&apos;ll build it step by step
          </p>
          <PromptBar
            onSubmit={handlePromptSubmit}
            isSubmitting={isCreating}
            disabled={isCreating || isRecording || isProcessingVoice}
            placeholder="e.g. Every morning, summarize my unread emails and send me a digest…"
            isRecording={isRecording}
            onStartRecording={handleStartRecording}
            onStopRecording={stopRecordingAndTranscribe}
            voiceInteractionMode="toggle"
            prefillRequest={inputPrefillRequest}
            renderModelSelector={modelSelectorNode}
          />
          {(isRecording || isProcessingVoice || voiceError) && (
            <div className="mt-4">
              <VoiceIndicator
                isRecording={isRecording}
                isProcessing={isProcessingVoice}
                error={voiceError}
                recordingLabel="Recording... Click the mic again to stop"
              />
            </div>
          )}
          <div className="mt-4 flex justify-center">
            <input
              ref={importFileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label="Import coworker JSON file"
              onChange={handleImportCoworkerFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleImportCoworkerClick}
              disabled={importCoworkerDefinition.isPending}
            >
              {importCoworkerDefinition.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Upload className="size-3" />
              )}
              Import coworker
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      ) : coworkerList.length === 0 ? (
        <div className="border-border/40 rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">No coworkers yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sharedByMeCount > 0 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleFilterShared}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filterShared
                    ? "border-foreground/20 bg-foreground text-background"
                    : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Share2 className="size-3" />
                Shared with workspace
                <span
                  className={cn(
                    "tabular-nums rounded-full px-1.5 text-[10px]",
                    filterShared ? "bg-background/20" : "bg-muted",
                  )}
                >
                  {sharedByMeCount}
                </span>
              </button>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {displayedCoworkerList.map((wf) => (
              <CoworkerCard
                key={wf.id}
                coworker={wf}
                connectedIntegrationTypes={connectedIntegrationTypes}
                isRunning={runningCoworkerId === wf.id}
                isUpdatingStatus={statusCoworkerId === wf.id}
                isUpdatingShare={shareCoworkerId === wf.id}
                isExporting={exportingCoworkerId === wf.id}
                isDeleting={deletingCoworkerId === wf.id}
                onRun={handleRunCoworker}
                onOpen={handleOpenCoworker}
                onToggleStatus={handleToggleCoworkerStatus}
                onToggleShare={handleToggleShare}
                onExport={handleExportCoworker}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        </div>
      )}
      {sharedCoworkerList.length > 0 ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold">Shared by teammates</h2>
            <p className="text-muted-foreground text-sm">
              Install a coworker into your own workspace environment.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {sharedCoworkerList.map((coworker) => (
              <SharedCoworkerCard
                key={coworker.id}
                coworker={coworker}
                connectedIntegrationTypes={connectedIntegrationTypes}
                isImporting={importingSharedCoworkerId === coworker.id}
                onImport={handleImportSharedCoworker}
              />
            ))}
          </div>
        </section>
      ) : null}
      <AlertDialog open={coworkerPendingDelete !== null} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete coworker?</AlertDialogTitle>
            <AlertDialogDescription>
              {coworkerPendingDelete
                ? `Delete ${getCoworkerDisplayName(coworkerPendingDelete.name)} and its run history? This action cannot be undone.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCoworkerId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deletingCoworkerId !== null}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {deletingCoworkerId !== null ? <Loader2 className="size-3 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
