"use client";

import type { ProviderAuthSource } from "@cmdclaw/core/lib/provider-auth-source";
import { DEFAULT_CONNECTED_CHATGPT_MODEL } from "@cmdclaw/core/lib/chat-model-defaults";
import {
  CUSTOM_SKILL_PREFIX,
  type CoworkerToolAccessMode,
} from "@cmdclaw/core/lib/coworker-tool-policy";
import { EMAIL_FORWARDED_TRIGGER_TYPE } from "@cmdclaw/core/lib/email-forwarding";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Loader2,
  Play,
  ChevronDown,
  Circle,
  Upload,
  FileText,
  X,
  ArrowLeft,
  ArrowRight,
  Pencil,
  Trash2,
  MessageSquare,
  Wrench,
  CirclePlay,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { ChatArea } from "@/components/chat/chat-area";
import { useChatSkillStore } from "@/components/chat/chat-skill-store";
import { ModelSelector } from "@/components/chat/model-selector";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DualPanelWorkspace } from "@/components/ui/dual-panel-workspace";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AnimatedTabs, AnimatedTab } from "@/components/ui/tabs";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useIsMobile } from "@/hooks/use-mobile";
import { normalizeChatModelSelection } from "@/lib/chat-model-selection";
import { getCoworkerRunStatusLabel } from "@/lib/coworker-status";
import {
  INTEGRATION_DISPLAY_NAMES,
  INTEGRATION_LOGOS,
  COWORKER_AVAILABLE_INTEGRATION_TYPES,
  isComingSoonIntegration,
  type IntegrationType,
} from "@/lib/integration-icons";
import {
  buildProviderAuthAvailabilityByProvider,
  type ProviderAuthAvailabilityByProvider,
} from "@/lib/provider-auth-availability";
import { cn } from "@/lib/utils";
import {
  useCreateCoworkerForwardingAlias,
  useDisableCoworkerForwardingAlias,
  useRotateCoworkerForwardingAlias,
  useCoworker,
  useCoworkerForwardingAlias,
  useUpdateCoworker,
  useDeleteCoworker,
  useCoworkerRun,
  useCoworkerRuns,
  useTriggerCoworker,
  useGetOrCreateBuilderConversation,
  usePlatformSkillList,
  useProviderAuthStatus,
  useSkillList,
  type CoworkerSchedule,
} from "@/orpc/hooks";

const BASE_TRIGGERS = [
  { value: "manual", label: "Manual only" },
  { value: "schedule", label: "Run on a schedule" },
  { value: EMAIL_FORWARDED_TRIGGER_TYPE, label: "Email forwarded to CmdClaw" },
  { value: "gmail.new_email", label: "New Gmail email" },
];

const scheduleMotionInitial = { opacity: 0, y: -8, height: 0 } as const;
const scheduleMotionAnimate = { opacity: 1, y: 0, height: "auto" } as const;
const scheduleMotionExit = { opacity: 0, y: -8, height: 0 } as const;
const scheduleMotionTransition = { duration: 0.22, ease: "easeOut" } as const;
const scheduleMotionStyle = { overflow: "hidden" } as const;
const sectionMotionInitial = { height: 0, opacity: 0 } as const;
const sectionMotionAnimate = { height: "auto" as const, opacity: 1 } as const;
const sectionMotionExit = { height: 0, opacity: 0 } as const;
const sectionMotionTransition = { duration: 0.2 } as const;
const instructionRemarkPlugins = [remarkGfm, remarkBreaks];
const toolboxRevealInitial = { opacity: 0, y: -4 } as const;
const toolboxRevealAnimate = { opacity: 1, y: 0 } as const;
const toolboxRevealTransition = { duration: 0.15 } as const;
const statusTextMotionInitial = { opacity: 0, y: -4 } as const;
const statusTextMotionAnimate = { opacity: 1, y: 0 } as const;
const statusTextMotionExit = { opacity: 0, y: 4 } as const;
const runViewerMotionInitial = { opacity: 0, x: 24 } as const;
const runViewerMotionAnimate = { opacity: 1, x: 0 } as const;
const runViewerMotionExit = { opacity: 0, x: 24 } as const;
const runListMotionInitial = { opacity: 0, x: -24 } as const;
const runListMotionAnimate = { opacity: 1, x: 0 } as const;
const runListMotionExit = { opacity: 0, x: -24 } as const;
const runMotionTransition = { duration: 0.2, ease: "easeOut" } as const;
const statusTextMotionTransition = { duration: 0.15 } as const;
const DEFAULT_COWORKER_MODEL = DEFAULT_CONNECTED_CHATGPT_MODEL;
type CoworkerTab = "chat" | "instruction" | "runs" | "docs" | "toolbox";

function formatRelativeTime(value?: Date | string | null) {
  if (!value) {
    return "just now";
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const rawDistance = formatDistanceToNowStrict(date, { roundingMethod: "floor" });
  const [amount, unit] = rawDistance.split(" ");
  if (!amount || !unit || amount === "0") {
    return "just now";
  }

  const shortUnit = unit.startsWith("second")
    ? "s"
    : unit.startsWith("minute")
      ? "m"
      : unit.startsWith("hour")
        ? "h"
        : unit.startsWith("day")
          ? "d"
          : unit.startsWith("month")
            ? "mo"
            : unit.startsWith("year")
              ? "y"
              : unit;

  return `${amount}${shortUnit} ago`;
}

function CoworkerChatPanel({
  conversationId,
  coworkerId,
  skillSelectionScopeKey,
}: {
  conversationId: string | null;
  coworkerId: string;
  skillSelectionScopeKey: string;
}) {
  if (!conversationId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  return (
    <ChatArea
      conversationId={conversationId}
      forceCoworkerQuerySync
      coworkerIdForSync={coworkerId}
      skillSelectionScopeKey={skillSelectionScopeKey}
    />
  );
}

export default function CoworkerEditorPage() {
  const params = useParams<{ id: string; runId?: string }>();
  const coworkerId = params?.id;
  const routeRunId = params?.runId ?? null;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAdmin } = useIsAdmin();
  const { data: coworker, isLoading } = useCoworker(coworkerId);
  const { data: platformSkills, isLoading: isPlatformSkillsLoading } = usePlatformSkillList();
  const { data: personalSkills, isLoading: isPersonalSkillsLoading } = useSkillList();
  const { data: providerAuthStatus } = useProviderAuthStatus();
  const { data: coworkerForwardingAlias } = useCoworkerForwardingAlias(coworkerId);
  const { data: runs, refetch: refetchRuns } = useCoworkerRuns(coworkerId);
  const updateCoworker = useUpdateCoworker();
  const createForwardingAlias = useCreateCoworkerForwardingAlias();
  const disableForwardingAlias = useDisableCoworkerForwardingAlias();
  const rotateForwardingAlias = useRotateCoworkerForwardingAlias();
  const triggerCoworker = useTriggerCoworker();
  const deleteCoworker = useDeleteCoworker();
  const getOrCreateBuilderConversation = useGetOrCreateBuilderConversation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [username, setUsername] = useState("");
  const [triggerType, setTriggerType] = useState("manual");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(DEFAULT_COWORKER_MODEL);
  const [modelAuthSource, setModelAuthSource] = useState<ProviderAuthSource | null>("shared");
  const [toolAccessMode, setToolAccessMode] = useState<CoworkerToolAccessMode>("all");
  const [allowedIntegrations, setAllowedIntegrations] = useState<IntegrationType[]>([]);
  const [allowedSkillSlugs, setAllowedSkillSlugs] = useState<string[]>([]);
  const [status, setStatus] = useState<"on" | "off">("off");
  const [autoApprove, setAutoApprove] = useState(true);
  const [showDisableAutoApproveDialog, setShowDisableAutoApproveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [copiedForwardingField, setCopiedForwardingField] = useState<
    "coworkerAlias" | "invokeHandle" | null
  >(null);
  const [builderConversationId, setBuilderConversationId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<CoworkerTab>("instruction");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(routeRunId);
  const isRunsRoute = pathname?.startsWith(`/coworkers/${coworkerId}/runs`) ?? false;
  const baseTabParam = searchParams.get("tab");
  const routeBaseTab: CoworkerTab | null =
    baseTabParam === "chat" ||
    baseTabParam === "instruction" ||
    baseTabParam === "docs" ||
    baseTabParam === "toolbox"
      ? baseTabParam
      : null;
  const hasSetMobileDefaultRef = useRef(false);
  useEffect(() => {
    if (!isMobile || hasSetMobileDefaultRef.current) {
      return;
    }
    hasSetMobileDefaultRef.current = true;
    if (!isRunsRoute) {
      setActiveTab("chat");
    }
  }, [isMobile, isRunsRoute]);

  useEffect(() => {
    if (!isRunsRoute) {
      setSelectedRunId(null);
      if (routeBaseTab) {
        setActiveTab(routeBaseTab);
      }
      return;
    }

    setActiveTab("runs");
    setSelectedRunId(routeRunId);
  }, [isRunsRoute, routeBaseTab, routeRunId]);
  const collapseToggleRef = useRef<(() => void) | null>(null);
  const handleClose = useCallback(() => {
    collapseToggleRef.current?.();
  }, []);
  const handleDelete = useCallback(() => {
    if (!coworkerId) {
      return;
    }
    deleteCoworker.mutate(coworkerId, {
      onSuccess: () => {
        toast.success("Coworker deleted");
        router.push("/coworkers");
      },
      onError: () => {
        toast.error("Failed to delete coworker");
      },
    });
  }, [coworkerId, deleteCoworker, router]);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedEditorRef = useRef(false);
  const initializedCoworkerIdRef = useRef<string | null>(null);
  const lastSyncedCoworkerUpdatedAtRef = useRef<string | null>(null);
  const lastSavedPayloadRef = useRef<string | null>(null);
  const builderConversationInitializedRef = useRef(false);

  // Schedule state (only used when triggerType is "schedule")
  const [scheduleType, setScheduleType] = useState<"interval" | "daily" | "weekly" | "monthly">(
    "daily",
  );
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleDaysOfWeek, setScheduleDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1);
  const providerAvailability = useMemo(
    () =>
      buildProviderAuthAvailabilityByProvider({
        connectedProviders: providerAuthStatus?.connected,
        sharedConnectedProviders: providerAuthStatus?.shared,
      }),
    [providerAuthStatus],
  );
  const localTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  const coworkerForwardingAddress = coworkerForwardingAlias?.forwardingAddress ?? null;
  const hasActiveForwardingAlias = Boolean(coworkerForwardingAlias?.activeAlias);
  const isEmailTriggerPersisted = coworker?.triggerType === EMAIL_FORWARDED_TRIGGER_TYPE;
  const integrationEntries = useMemo(
    () =>
      COWORKER_AVAILABLE_INTEGRATION_TYPES.map((key) => ({
        key,
        name: INTEGRATION_DISPLAY_NAMES[key],
        logo: INTEGRATION_LOGOS[key],
      })),
    [],
  );
  const allIntegrationTypes = useMemo(
    () => integrationEntries.map((entry) => entry.key),
    [integrationEntries],
  );
  const triggers = useMemo(
    () => [
      ...BASE_TRIGGERS,
      ...(isAdmin || !isComingSoonIntegration("twitter")
        ? ([{ value: "twitter.new_dm", label: "New X (Twitter) DM" }] as const)
        : []),
    ],
    [isAdmin],
  );
  const skillSelectionScopeKey = useMemo(
    () => (coworkerId ? `coworker-builder:${coworkerId}` : "coworker-builder"),
    [coworkerId],
  );
  const setSelectedSkillSlugs = useChatSkillStore((state) => state.setSelectedSkillSlugs);
  const selectedSkillKeys = allowedSkillSlugs;
  const availableSkills = useMemo(
    () => [
      ...(platformSkills ?? []).map((skill) => ({
        key: skill.slug,
        title: skill.title,
        source: "Platform" as const,
      })),
      ...((personalSkills ?? [])
        .filter((skill) => skill.enabled)
        .map((skill) => ({
          key: `${CUSTOM_SKILL_PREFIX}${skill.name}`,
          title: skill.displayName,
          source: "Custom" as const,
        })) ?? []),
    ],
    [personalSkills, platformSkills],
  );
  const restrictTools = toolAccessMode === "selected";

  const buildSchedule = useCallback((): CoworkerSchedule | null => {
    if (triggerType !== "schedule") {
      return null;
    }

    switch (scheduleType) {
      case "interval":
        return {
          type: "interval",
          intervalMinutes: Math.max(60, Math.round(intervalMinutes / 60) * 60),
        };
      case "daily":
        return {
          type: "daily",
          time: scheduleTime.slice(0, 5),
          timezone: localTimezone,
        };
      case "weekly":
        return {
          type: "weekly",
          time: scheduleTime.slice(0, 5),
          daysOfWeek: scheduleDaysOfWeek,
          timezone: localTimezone,
        };
      case "monthly":
        return {
          type: "monthly",
          time: scheduleTime.slice(0, 5),
          dayOfMonth: scheduleDayOfMonth,
          timezone: localTimezone,
        };
      default:
        return null;
    }
  }, [
    intervalMinutes,
    localTimezone,
    scheduleDayOfMonth,
    scheduleDaysOfWeek,
    scheduleTime,
    scheduleType,
    triggerType,
  ]);

  const getCoworkerUpdateInput = useCallback(() => {
    if (!coworkerId) {
      return null;
    }
    return {
      id: coworkerId,
      name,
      description,
      username,
      status,
      triggerType,
      prompt,
      model,
      authSource: modelAuthSource,
      autoApprove,
      toolAccessMode,
      allowedIntegrations,
      allowedSkillSlugs,
      schedule: buildSchedule(),
    };
  }, [
    allowedIntegrations,
    allowedSkillSlugs,
    autoApprove,
    buildSchedule,
    description,
    model,
    modelAuthSource,
    name,
    prompt,
    status,
    toolAccessMode,
    triggerType,
    username,
    coworkerId,
  ]);

  const getCoworkerPayloadSignature = useCallback(
    (input: NonNullable<ReturnType<typeof getCoworkerUpdateInput>>) =>
      JSON.stringify({
        ...input,
        allowedIntegrations: [...input.allowedIntegrations].toSorted(),
        allowedSkillSlugs: [...input.allowedSkillSlugs].toSorted(),
        schedule:
          input.schedule?.type === "weekly"
            ? {
                ...input.schedule,
                daysOfWeek: [...input.schedule.daysOfWeek].toSorted(),
              }
            : input.schedule,
      }),
    [],
  );

  const persistCoworker = useCallback(
    async (options?: { force?: boolean }) => {
      const input = getCoworkerUpdateInput();
      if (!input) {
        return false;
      }

      const signature = getCoworkerPayloadSignature(input);
      if (!options?.force && signature === lastSavedPayloadRef.current) {
        return true;
      }

      setIsSaving(true);
      try {
        await updateCoworker.mutateAsync(input);
        lastSavedPayloadRef.current = signature;
        return true;
      } catch (error) {
        console.error("Failed to update coworker:", error);
        toast.error("Failed to save coworker.");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [getCoworkerPayloadSignature, getCoworkerUpdateInput, updateCoworker],
  );

  useEffect(() => {
    if (!coworker) {
      return;
    }

    const normalizedModelSelection = normalizeChatModelSelection({
      model: coworker.model ?? DEFAULT_COWORKER_MODEL,
      authSource: coworker.authSource ?? null,
    });
    const availableIntegrationTypes = COWORKER_AVAILABLE_INTEGRATION_TYPES;
    const coworkerAllowedIntegrations = (
      (coworker.allowedIntegrations ?? []) as IntegrationType[]
    ).filter((type): type is IntegrationType => availableIntegrationTypes.includes(type));
    const payloadFromCoworker = {
      id: coworker.id,
      name: coworker.name,
      description: coworker.description ?? "",
      username: coworker.username ?? "",
      status: coworker.status,
      triggerType: coworker.triggerType,
      prompt: coworker.prompt,
      model: coworker.model ?? DEFAULT_COWORKER_MODEL,
      authSource: normalizedModelSelection.authSource,
      autoApprove: coworker.autoApprove ?? true,
      toolAccessMode: coworker.toolAccessMode,
      allowedIntegrations: coworkerAllowedIntegrations,
      allowedSkillSlugs: coworker.allowedSkillSlugs ?? [],
      schedule: (coworker.schedule as CoworkerSchedule | null) ?? null,
    } as const;
    const serverPayloadSignature = getCoworkerPayloadSignature(payloadFromCoworker);
    const currentLocalPayload = hasInitializedEditorRef.current ? getCoworkerUpdateInput() : null;
    const currentLocalSignature = currentLocalPayload
      ? getCoworkerPayloadSignature(currentLocalPayload)
      : null;
    const hasUnsavedLocalChanges =
      currentLocalSignature !== null &&
      lastSavedPayloadRef.current !== null &&
      currentLocalSignature !== lastSavedPayloadRef.current;
    const coworkerUpdatedAt =
      coworker.updatedAt instanceof Date
        ? coworker.updatedAt.toISOString()
        : new Date(coworker.updatedAt).toISOString();
    const isFirstHydration = initializedCoworkerIdRef.current !== coworker.id;
    const hasFreshServerUpdate = lastSyncedCoworkerUpdatedAtRef.current !== coworkerUpdatedAt;

    if (!isFirstHydration && (!hasFreshServerUpdate || hasUnsavedLocalChanges)) {
      return;
    }

    setName(coworker.name);
    setDescription(coworker.description ?? "");
    setUsername(coworker.username ?? "");
    setTriggerType(coworker.triggerType);
    setPrompt(coworker.prompt);
    setModel(normalizedModelSelection.model || DEFAULT_COWORKER_MODEL);
    setModelAuthSource(normalizedModelSelection.authSource);
    setToolAccessMode(coworker.toolAccessMode);
    setAllowedIntegrations(coworkerAllowedIntegrations);
    setAllowedSkillSlugs(coworker.allowedSkillSlugs ?? []);
    setStatus(coworker.status);
    setAutoApprove(coworker.autoApprove ?? true);

    // Initialize schedule state (when trigger is "schedule")
    const schedule = coworker.schedule as CoworkerSchedule | null;
    if (schedule) {
      setScheduleType(schedule.type);
      if (schedule.type === "interval") {
        setIntervalMinutes(Math.max(60, schedule.intervalMinutes));
      } else if (schedule.type === "daily") {
        setScheduleTime(schedule.time.slice(0, 5));
      } else if (schedule.type === "weekly") {
        setScheduleTime(schedule.time.slice(0, 5));
        setScheduleDaysOfWeek(schedule.daysOfWeek);
      } else if (schedule.type === "monthly") {
        setScheduleTime(schedule.time.slice(0, 5));
        setScheduleDayOfMonth(schedule.dayOfMonth);
      }
    }
    initializedCoworkerIdRef.current = coworker.id;
    lastSyncedCoworkerUpdatedAtRef.current = coworkerUpdatedAt;
    hasInitializedEditorRef.current = true;
    lastSavedPayloadRef.current = serverPayloadSignature;
  }, [coworker, getCoworkerPayloadSignature, getCoworkerUpdateInput]);

  useEffect(() => {
    setSelectedSkillSlugs(skillSelectionScopeKey, allowedSkillSlugs);
  }, [allowedSkillSlugs, setSelectedSkillSlugs, skillSelectionScopeKey]);

  // Get or create builder conversation once coworker loads
  useEffect(() => {
    if (!coworker || builderConversationInitializedRef.current) {
      return;
    }
    builderConversationInitializedRef.current = true;
    getOrCreateBuilderConversation.mutate(coworker.id, {
      onSuccess: (result) => {
        setBuilderConversationId(result.conversationId);
      },
    });
  }, [coworker, getOrCreateBuilderConversation]);

  const handleStatusChange = useCallback((checked: boolean) => {
    setStatus(checked ? "on" : "off");
  }, []);

  const handleAutoApproveChange = useCallback((checked: boolean) => {
    if (checked) {
      setAutoApprove(true);
      return;
    }
    setShowDisableAutoApproveDialog(true);
  }, []);

  const handleNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  }, []);

  const handleDescriptionChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(event.target.value);
  }, []);

  const handleUsernameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(event.target.value);
  }, []);

  const handleModelSelectionChange = useCallback(
    (input: { model: string; authSource?: ProviderAuthSource | null }) => {
      setModel(input.model);
      setModelAuthSource(input.authSource ?? null);
    },
    [],
  );

  const handleScheduleTypeChange = useCallback((value: string) => {
    setScheduleType(value as "interval" | "daily" | "weekly" | "monthly");
  }, []);

  const handleIntervalHoursChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const hours = Math.max(1, parseInt(event.target.value) || 1);
    setIntervalMinutes(hours * 60);
  }, []);

  const handleScheduleTimeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setScheduleTime(event.target.value.slice(0, 5));
  }, []);

  const handleToggleWeekDay = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const dayIndex = parseInt(event.currentTarget.dataset.dayIndex || "", 10);
    if (Number.isNaN(dayIndex)) {
      return;
    }
    setScheduleDaysOfWeek((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex].toSorted(),
    );
  }, []);

  const handleScheduleDayOfMonthChange = useCallback((value: string) => {
    setScheduleDayOfMonth(parseInt(value, 10));
  }, []);

  const handlePromptChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(event.target.value);
  }, []);

  const handleRestrictToolsChange = useCallback((checked: boolean) => {
    if (checked) {
      setToolAccessMode("all");
      return;
    }
    setToolAccessMode("selected");
  }, []);

  const handleSelectAllIntegrations = useCallback(() => {
    setAllowedIntegrations(allIntegrationTypes);
  }, [allIntegrationTypes]);

  const handleClearIntegrations = useCallback(() => {
    setAllowedIntegrations([]);
  }, []);

  const handleToggleIntegrationChecked = useCallback((type: IntegrationType) => {
    setAllowedIntegrations((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }, []);
  const handleToggleSkillChecked = useCallback(
    (skillKey: string) => {
      const next = selectedSkillKeys.includes(skillKey)
        ? selectedSkillKeys.filter((key) => key !== skillKey)
        : [...selectedSkillKeys, skillKey];
      setAllowedSkillSlugs(next);
    },
    [selectedSkillKeys],
  );
  const handleClearSkills = useCallback(() => {
    setAllowedSkillSlugs([]);
  }, []);

  const handleDisableAutoApprove = useCallback(() => {
    setAutoApprove(false);
    setShowDisableAutoApproveDialog(false);
  }, []);

  const handleCopyForwardingAddress = useCallback(
    async (value: string, field: "coworkerAlias" | "invokeHandle") => {
      try {
        await navigator.clipboard.writeText(value);
        setCopiedForwardingField(field);
        setTimeout(() => setCopiedForwardingField(null), 1500);
      } catch (error) {
        console.error("Failed to copy forwarding address:", error);
      }
    },
    [],
  );

  const handleCopyCoworkerAlias = useCallback(() => {
    if (!coworkerForwardingAddress) {
      return;
    }
    void handleCopyForwardingAddress(coworkerForwardingAddress, "coworkerAlias");
  }, [handleCopyForwardingAddress, coworkerForwardingAddress]);

  const handleCreateCoworkerAlias = useCallback(async () => {
    if (!coworkerId) {
      return;
    }

    try {
      await createForwardingAlias.mutateAsync(coworkerId);
      toast.success("Forwarding address created.");
    } catch (error) {
      console.error("Failed to create forwarding alias:", error);
      toast.error("Failed to create forwarding address.");
    }
  }, [createForwardingAlias, coworkerId]);

  const handleRotateCoworkerAlias = useCallback(async () => {
    if (!coworkerId) {
      return;
    }

    try {
      await rotateForwardingAlias.mutateAsync(coworkerId);
      toast.success("Forwarding address rotated.");
    } catch (error) {
      console.error("Failed to rotate forwarding alias:", error);
      toast.error("Failed to rotate forwarding address.");
    }
  }, [rotateForwardingAlias, coworkerId]);

  const handleDisableCoworkerAlias = useCallback(async () => {
    if (!coworkerId) {
      return;
    }

    try {
      await disableForwardingAlias.mutateAsync(coworkerId);
      toast.success("Forwarding address disabled.");
    } catch (error) {
      console.error("Failed to disable forwarding alias:", error);
      toast.error("Failed to disable forwarding address.");
    }
  }, [disableForwardingAlias, coworkerId]);

  useEffect(() => {
    if (!hasInitializedEditorRef.current) {
      return;
    }
    if (!coworkerId) {
      return;
    }
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      void persistCoworker();
    }, 1000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    allowedIntegrations,
    autoApprove,
    buildSchedule,
    description,
    model,
    name,
    persistCoworker,
    prompt,
    scheduleDayOfMonth,
    scheduleDaysOfWeek,
    scheduleTime,
    scheduleType,
    status,
    toolAccessMode,
    triggerType,
    username,
    allowedSkillSlugs,
    coworkerId,
  ]);

  const handleRun = useCallback(async () => {
    if (!coworkerId || isStartingRun) {
      return;
    }

    setIsStartingRun(true);
    try {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      const saveSucceeded = await persistCoworker({ force: true });
      if (!saveSucceeded) {
        toast.error("Failed to save coworker before test run.");
        return;
      }

      await triggerCoworker.mutateAsync({ id: coworkerId, payload: {} });
      toast.success("Run started.");
      void refetchRuns();
    } catch (error) {
      console.error("Failed to run coworker:", error);
      toast.error("Failed to start run.");
    } finally {
      setIsStartingRun(false);
    }
  }, [isStartingRun, persistCoworker, refetchRuns, triggerCoworker, coworkerId]);

  const hasAgentInstructions = prompt.trim().length > 0;
  const coworkerDisplayName = coworker?.name?.trim().length ? coworker.name : "New Coworker";

  const buildCoworkerEditorHref = useCallback(
    (tab?: Exclude<CoworkerTab, "runs"> | null) => {
      if (!coworkerId) {
        return "/coworkers";
      }

      if (!tab || tab === "instruction") {
        return `/coworkers/${coworkerId}`;
      }

      return `/coworkers/${coworkerId}?tab=${tab}`;
    },
    [coworkerId],
  );

  const buildCoworkerPanelHref = useCallback(
    (options?: { runId?: string | null }) => {
      if (!coworkerId) {
        return "/coworkers";
      }

      if (options?.runId) {
        return `/coworkers/${coworkerId}/runs/${options.runId}`;
      }

      return `/coworkers/${coworkerId}/runs`;
    },
    [coworkerId],
  );

  const handleRunClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setActiveTab("runs");
      setSelectedRunId(null);
      router.replace(buildCoworkerPanelHref());
      void handleRun();
    },
    [buildCoworkerPanelHref, handleRun, router],
  );

  const isRunDisabled =
    !hasAgentInstructions || status !== "on" || triggerCoworker.isPending || isStartingRun;
  const isRunning = triggerCoworker.isPending || isStartingRun;

  const handleMobileTabChange = useCallback(
    (key: string) => {
      const nextTab = key as CoworkerTab;
      setActiveTab(nextTab);
      setSelectedRunId(null);

      if (!coworkerId) {
        return;
      }

      if (nextTab === "runs") {
        router.replace(buildCoworkerPanelHref());
        return;
      }

      if (isRunsRoute || routeBaseTab !== nextTab) {
        router.replace(buildCoworkerEditorHref(nextTab));
      }
    },
    [
      buildCoworkerEditorHref,
      buildCoworkerPanelHref,
      coworkerId,
      isRunsRoute,
      routeBaseTab,
      router,
    ],
  );
  const handleSelectRun = useCallback(
    (runId: string) => {
      setActiveTab("runs");
      setSelectedRunId(runId);
      router.push(buildCoworkerPanelHref({ runId }));
    },
    [buildCoworkerPanelHref, router],
  );
  const handleBackToRuns = useCallback(() => {
    setActiveTab("runs");
    setSelectedRunId(null);
    router.replace(buildCoworkerPanelHref());
  }, [buildCoworkerPanelHref, router]);
  const handleOpenDeleteDialog = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);
  const handleNavigateToCoworkers = useCallback(() => {
    router.push("/coworkers");
  }, [router]);

  const chatPanel = useMemo(
    () => (
      <CoworkerChatPanel
        conversationId={builderConversationId}
        coworkerId={coworkerId ?? ""}
        skillSelectionScopeKey={skillSelectionScopeKey}
      />
    ),
    [builderConversationId, coworkerId, skillSelectionScopeKey],
  );

  const settingsPanel = useMemo(
    () => (
      <CoworkerSettingsPanel
        name={name}
        description={description}
        username={username}
        isSaving={isSaving}
        status={status}
        autoApprove={autoApprove}
        prompt={prompt}
        model={model}
        modelAuthSource={modelAuthSource}
        providerAvailability={providerAvailability}
        availableSkills={availableSkills}
        selectedSkillKeys={selectedSkillKeys}
        isSkillsLoading={isPlatformSkillsLoading || isPersonalSkillsLoading}
        restrictTools={restrictTools}
        allowedIntegrations={allowedIntegrations}
        allIntegrationTypes={allIntegrationTypes}
        integrationEntries={integrationEntries}
        triggerType={triggerType}
        triggers={triggers}
        scheduleType={scheduleType}
        intervalMinutes={intervalMinutes}
        scheduleTime={scheduleTime}
        scheduleDaysOfWeek={scheduleDaysOfWeek}
        scheduleDayOfMonth={scheduleDayOfMonth}
        localTimezone={localTimezone}
        hasActiveForwardingAlias={hasActiveForwardingAlias}
        coworkerForwardingAddress={coworkerForwardingAddress}
        coworkerForwardingAlias={coworkerForwardingAlias}
        isEmailTriggerPersisted={isEmailTriggerPersisted}
        copiedForwardingField={copiedForwardingField}
        runs={runs}
        activeTab={activeTab}
        selectedRunId={selectedRunId}
        isRunDisabled={isRunDisabled}
        isRunning={isRunning}
        createForwardingAlias={createForwardingAlias}
        disableForwardingAlias={disableForwardingAlias}
        rotateForwardingAlias={rotateForwardingAlias}
        onTabChange={handleMobileTabChange}
        onRun={handleRunClick}
        onSelectRun={handleSelectRun}
        onBackToRuns={handleBackToRuns}
        onNameChange={handleNameChange}
        onDescriptionChange={handleDescriptionChange}
        onUsernameChange={handleUsernameChange}
        onStatusChange={handleStatusChange}
        onAutoApproveChange={handleAutoApproveChange}
        onPromptChange={handlePromptChange}
        onModelChange={handleModelSelectionChange}
        onClearSkills={handleClearSkills}
        onToggleSkillChecked={handleToggleSkillChecked}
        onRestrictToolsChange={handleRestrictToolsChange}
        onSelectAllIntegrations={handleSelectAllIntegrations}
        onClearIntegrations={handleClearIntegrations}
        onToggleIntegrationChecked={handleToggleIntegrationChecked}
        onTriggerTypeChange={setTriggerType}
        onScheduleTypeChange={handleScheduleTypeChange}
        onIntervalHoursChange={handleIntervalHoursChange}
        onScheduleTimeChange={handleScheduleTimeChange}
        onToggleWeekDay={handleToggleWeekDay}
        onScheduleDayOfMonthChange={handleScheduleDayOfMonthChange}
        onCopyCoworkerAlias={handleCopyCoworkerAlias}
        onRotateCoworkerAlias={handleRotateCoworkerAlias}
        onDisableCoworkerAlias={handleDisableCoworkerAlias}
        onCreateCoworkerAlias={handleCreateCoworkerAlias}
        onClose={handleClose}
        showDeleteDialog={showDeleteDialog}
        onShowDeleteDialogChange={setShowDeleteDialog}
        onDelete={handleDelete}
        isDeleting={deleteCoworker.isPending}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dep list tracks all panel props
    [
      name,
      description,
      username,
      isSaving,
      status,
      autoApprove,
      prompt,
      model,
      availableSkills,
      selectedSkillKeys,
      isPlatformSkillsLoading,
      isPersonalSkillsLoading,
      restrictTools,
      allowedIntegrations,
      allIntegrationTypes,
      integrationEntries,
      triggerType,
      triggers,
      scheduleType,
      intervalMinutes,
      scheduleTime,
      scheduleDaysOfWeek,
      scheduleDayOfMonth,
      localTimezone,
      hasActiveForwardingAlias,
      coworkerForwardingAddress,
      coworkerForwardingAlias,
      isEmailTriggerPersisted,
      copiedForwardingField,
      runs,
      activeTab,
      selectedRunId,
      isRunDisabled,
      isRunning,
      createForwardingAlias,
      disableForwardingAlias,
      rotateForwardingAlias,
      handleMobileTabChange,
      handleRunClick,
      handleSelectRun,
      handleBackToRuns,
      handleNameChange,
      handleDescriptionChange,
      handleUsernameChange,
      handleStatusChange,
      handleAutoApproveChange,
      handlePromptChange,
      setModel,
      handleClearSkills,
      handleToggleSkillChecked,
      handleRestrictToolsChange,
      handleSelectAllIntegrations,
      handleClearIntegrations,
      handleToggleIntegrationChecked,
      setTriggerType,
      handleScheduleTypeChange,
      handleIntervalHoursChange,
      handleScheduleTimeChange,
      handleToggleWeekDay,
      handleScheduleDayOfMonthChange,
      handleCopyCoworkerAlias,
      handleRotateCoworkerAlias,
      handleDisableCoworkerAlias,
      handleCreateCoworkerAlias,
      showDeleteDialog,
      setShowDeleteDialog,
      handleDelete,
      deleteCoworker.isPending,
    ],
  );

  if (isLoading || !coworker) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        {/* Mobile icon tab bar */}
        <div className="border-border/40 flex items-center justify-between gap-1 border-b px-2 py-1.5">
          <AnimatedTabs activeKey={activeTab} onTabChange={handleMobileTabChange} className="gap-0">
            <AnimatedTab value="chat" className="px-2.5">
              <MessageSquare className="h-4 w-4" aria-label="Chat" />
            </AnimatedTab>
            <AnimatedTab value="instruction" className="px-2.5">
              <Pencil className="h-4 w-4" aria-label="Instruction" />
            </AnimatedTab>
            <AnimatedTab value="runs" className="px-2.5">
              <Play className="h-4 w-4" aria-label="Runs" />
            </AnimatedTab>
            <AnimatedTab value="docs" className="px-2.5">
              <FileText className="h-4 w-4" aria-label="Docs" />
            </AnimatedTab>
            <AnimatedTab value="toolbox" className="px-2.5">
              <Wrench className="h-4 w-4" aria-label="Toolbox" />
            </AnimatedTab>
          </AnimatedTabs>
          <div className="flex shrink-0 items-center gap-1.5">
            <Switch checked={status === "on"} onCheckedChange={handleStatusChange} />
            <button
              type="button"
              onClick={handleRunClick}
              disabled={isRunDisabled}
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-40"
              aria-label="Run now"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CirclePlay className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={handleOpenDeleteDialog}
              className="text-muted-foreground hover:text-destructive hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              aria-label="Delete coworker"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNavigateToCoworkers}
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Mobile content area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeTab === "chat" ? (
            chatPanel
          ) : (
            <CoworkerSettingsPanel
              name={name}
              description={description}
              username={username}
              isSaving={isSaving}
              status={status}
              autoApprove={autoApprove}
              prompt={prompt}
              model={model}
              modelAuthSource={modelAuthSource}
              providerAvailability={providerAvailability}
              availableSkills={availableSkills}
              selectedSkillKeys={selectedSkillKeys}
              isSkillsLoading={isPlatformSkillsLoading || isPersonalSkillsLoading}
              restrictTools={restrictTools}
              allowedIntegrations={allowedIntegrations}
              allIntegrationTypes={allIntegrationTypes}
              integrationEntries={integrationEntries}
              triggerType={triggerType}
              triggers={triggers}
              scheduleType={scheduleType}
              intervalMinutes={intervalMinutes}
              scheduleTime={scheduleTime}
              scheduleDaysOfWeek={scheduleDaysOfWeek}
              scheduleDayOfMonth={scheduleDayOfMonth}
              localTimezone={localTimezone}
              hasActiveForwardingAlias={hasActiveForwardingAlias}
              coworkerForwardingAddress={coworkerForwardingAddress}
              coworkerForwardingAlias={coworkerForwardingAlias}
              isEmailTriggerPersisted={isEmailTriggerPersisted}
              copiedForwardingField={copiedForwardingField}
              runs={runs}
              activeTab={activeTab}
              selectedRunId={selectedRunId}
              isRunDisabled={isRunDisabled}
              isRunning={isRunning}
              createForwardingAlias={createForwardingAlias}
              disableForwardingAlias={disableForwardingAlias}
              rotateForwardingAlias={rotateForwardingAlias}
              onTabChange={handleMobileTabChange}
              onRun={handleRunClick}
              onSelectRun={handleSelectRun}
              onBackToRuns={handleBackToRuns}
              onNameChange={handleNameChange}
              onDescriptionChange={handleDescriptionChange}
              onUsernameChange={handleUsernameChange}
              onStatusChange={handleStatusChange}
              onAutoApproveChange={handleAutoApproveChange}
              onPromptChange={handlePromptChange}
              onModelChange={handleModelSelectionChange}
              onClearSkills={handleClearSkills}
              onToggleSkillChecked={handleToggleSkillChecked}
              onRestrictToolsChange={handleRestrictToolsChange}
              onSelectAllIntegrations={handleSelectAllIntegrations}
              onClearIntegrations={handleClearIntegrations}
              onToggleIntegrationChecked={handleToggleIntegrationChecked}
              onTriggerTypeChange={setTriggerType}
              onScheduleTypeChange={handleScheduleTypeChange}
              onIntervalHoursChange={handleIntervalHoursChange}
              onScheduleTimeChange={handleScheduleTimeChange}
              onToggleWeekDay={handleToggleWeekDay}
              onScheduleDayOfMonthChange={handleScheduleDayOfMonthChange}
              onCopyCoworkerAlias={handleCopyCoworkerAlias}
              onRotateCoworkerAlias={handleRotateCoworkerAlias}
              onDisableCoworkerAlias={handleDisableCoworkerAlias}
              onCreateCoworkerAlias={handleCreateCoworkerAlias}
              onClose={handleClose}
              showDeleteDialog={showDeleteDialog}
              onShowDeleteDialogChange={setShowDeleteDialog}
              onDelete={handleDelete}
              isDeleting={deleteCoworker.isPending}
              hideHeader
            />
          )}
        </div>
        <AlertDialog
          open={showDisableAutoApproveDialog}
          onOpenChange={setShowDisableAutoApproveDialog}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Turn off auto-approve?</AlertDialogTitle>
              <AlertDialogDescription>
                If you turn this off, coworker runs can stop and wait for manual approval on write
                actions. The coworker might stay stuck until someone approves in the UI.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep on</AlertDialogCancel>
              <AlertDialogAction onClick={handleDisableAutoApprove}>Turn off</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete coworker?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this coworker and all of its run history. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteCoworker.isPending}
                className="bg-destructive hover:bg-destructive/90 text-white"
              >
                {deleteCoworker.isPending ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <DualPanelWorkspace
        storageKey="coworker-editor-panels-v2"
        defaultRightWidth={50}
        minRightWidth={50}
        collapsible
        showExpandedCollapseButton={false}
        showTitles={false}
        leftTitle="Chat"
        rightTitle={coworkerDisplayName}
        leftPanelClassName="border-0 rounded-none"
        separatorClassName="bg-muted/30"
        rightPanelClassName="border-0 rounded-none bg-muted/30 md:min-w-[34rem]"
        left={chatPanel}
        right={settingsPanel}
        onCollapseToggleRef={collapseToggleRef}
        hideMobileToggle
      />
      <AlertDialog
        open={showDisableAutoApproveDialog}
        onOpenChange={setShowDisableAutoApproveDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off auto-approve?</AlertDialogTitle>
            <AlertDialogDescription>
              If you turn this off, coworker runs can stop and wait for manual approval on write
              actions. The coworker might stay stuck until someone approves in the UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep on</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisableAutoApprove}>Turn off</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InlineRunViewer({ runId, onBack }: { runId: string; onBack: () => void }) {
  const { data: run, isLoading } = useCoworkerRun(runId);

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 px-4 py-2">
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground hover:bg-muted -ml-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Runs
          </button>
        </div>
        <div className="text-muted-foreground px-4 text-xs">Run not found.</div>
      </div>
    );
  }

  if (!run.conversationId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 px-4 py-2">
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground hover:bg-muted -ml-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Runs
          </button>
        </div>
        <div className="px-4 py-2">
          <p className="text-muted-foreground text-xs">
            This run does not have a linked conversation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border/30 flex items-center gap-2 border-b px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground hover:bg-muted -ml-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Runs
        </button>
        <Circle
          className={cn(
            "ml-1 h-1.5 w-1.5 shrink-0 fill-current",
            run.status === "completed"
              ? "text-emerald-500"
              : run.status === "running" ||
                  run.status === "awaiting_approval" ||
                  run.status === "awaiting_auth"
                ? "text-blue-500"
                : run.status === "paused"
                  ? "text-amber-500"
                  : run.status === "error" || run.status === "cancelled"
                    ? "text-red-500"
                    : "text-muted-foreground",
          )}
        />
        <span className="text-foreground/70 text-xs">{getCoworkerRunStatusLabel(run.status)}</span>
        <span className="text-muted-foreground ml-auto text-xs">
          {formatRelativeTime(run.startedAt)}
        </span>
      </div>
      <div className="bg-background flex min-h-0 flex-1 overflow-hidden">
        <ChatArea conversationId={run.conversationId} />
      </div>
    </div>
  );
}

type CoworkerSettingsPanelProps = {
  name: string;
  description: string;
  username: string;
  isSaving: boolean;
  status: "on" | "off";
  autoApprove: boolean;
  prompt: string;
  model: string;
  modelAuthSource: ProviderAuthSource | null;
  providerAvailability: ProviderAuthAvailabilityByProvider;
  availableSkills: { key: string; title: string; source: "Platform" | "Custom" }[];
  selectedSkillKeys: string[];
  isSkillsLoading: boolean;
  restrictTools: boolean;
  allowedIntegrations: IntegrationType[];
  allIntegrationTypes: IntegrationType[];
  integrationEntries: { key: IntegrationType; name: string; logo: string }[];
  triggerType: string;
  triggers: readonly { value: string; label: string }[];
  scheduleType: "interval" | "daily" | "weekly" | "monthly";
  intervalMinutes: number;
  scheduleTime: string;
  scheduleDaysOfWeek: number[];
  scheduleDayOfMonth: number;
  localTimezone: string;
  hasActiveForwardingAlias: boolean;
  coworkerForwardingAddress: string | null;
  coworkerForwardingAlias:
    | {
        receivingDomain: string | null;
        activeAlias: unknown | null;
        forwardingAddress: string | null;
      }
    | undefined;
  isEmailTriggerPersisted: boolean;
  copiedForwardingField: "coworkerAlias" | "invokeHandle" | null;
  runs:
    | Array<{
        id: string;
        status: string;
        startedAt: Date;
        finishedAt: Date | null;
        errorMessage: string | null;
      }>
    | undefined;
  activeTab: CoworkerTab;
  selectedRunId: string | null;
  isRunDisabled: boolean;
  isRunning: boolean;
  createForwardingAlias: { isPending: boolean };
  disableForwardingAlias: { isPending: boolean };
  rotateForwardingAlias: { isPending: boolean };
  onTabChange: (tab: CoworkerTab) => void;
  onRun: (e: React.MouseEvent) => void;
  onSelectRun: (runId: string) => void;
  onBackToRuns: () => void;
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDescriptionChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onUsernameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStatusChange: (checked: boolean) => void;
  onAutoApproveChange: (checked: boolean) => void;
  onPromptChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onModelChange: (input: { model: string; authSource?: ProviderAuthSource | null }) => void;
  onClearSkills: () => void;
  onToggleSkillChecked: (skillKey: string) => void;
  onRestrictToolsChange: (checked: boolean) => void;
  onSelectAllIntegrations: () => void;
  onClearIntegrations: () => void;
  onToggleIntegrationChecked: (type: IntegrationType) => void;
  onTriggerTypeChange: (value: string) => void;
  onScheduleTypeChange: (value: string) => void;
  onIntervalHoursChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onScheduleTimeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleWeekDay: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onScheduleDayOfMonthChange: (value: string) => void;
  onCopyCoworkerAlias: () => void;
  onRotateCoworkerAlias: () => void;
  onDisableCoworkerAlias: () => void;
  onCreateCoworkerAlias: () => void;
  onClose: () => void;
  showDeleteDialog: boolean;
  onShowDeleteDialogChange: (open: boolean) => void;
  onDelete: () => void;
  isDeleting: boolean;
  hideHeader?: boolean;
};

function CoworkerSettingsPanel({
  name,
  description,
  username,
  isSaving,
  status,
  autoApprove,
  prompt,
  model,
  modelAuthSource,
  providerAvailability,
  availableSkills,
  selectedSkillKeys,
  isSkillsLoading,
  restrictTools,
  allowedIntegrations,
  allIntegrationTypes,
  integrationEntries,
  triggerType,
  triggers,
  scheduleType,
  intervalMinutes,
  scheduleTime,
  scheduleDaysOfWeek,
  scheduleDayOfMonth,
  localTimezone,
  hasActiveForwardingAlias,
  coworkerForwardingAddress,
  coworkerForwardingAlias,
  isEmailTriggerPersisted,
  copiedForwardingField,
  runs,
  activeTab,
  selectedRunId,
  isRunDisabled,
  isRunning,
  createForwardingAlias,
  disableForwardingAlias,
  rotateForwardingAlias,
  onTabChange,
  onRun,
  onSelectRun,
  onBackToRuns,
  onNameChange,
  onDescriptionChange,
  onUsernameChange,
  onStatusChange,
  onAutoApproveChange,
  onPromptChange,
  onModelChange,
  onClearSkills,
  onToggleSkillChecked,
  onRestrictToolsChange,
  onSelectAllIntegrations,
  onClearIntegrations,
  onToggleIntegrationChecked,
  onTriggerTypeChange,
  onScheduleTypeChange,
  onIntervalHoursChange,
  onScheduleTimeChange,
  onToggleWeekDay,
  onScheduleDayOfMonthChange,
  onCopyCoworkerAlias,
  onRotateCoworkerAlias,
  onDisableCoworkerAlias,
  onCreateCoworkerAlias,
  onClose,
  showDeleteDialog,
  onShowDeleteDialogChange,
  onDelete,
  isDeleting,
  hideHeader,
}: CoworkerSettingsPanelProps) {
  const [instructionModalOpen, setInstructionModalOpen] = useState(false);
  const [triggerExpanded, setTriggerExpanded] = useState(false);

  const handleOpenInstructionModal = useCallback(() => {
    setInstructionModalOpen(true);
  }, []);

  const handleCloseInstructionModal = useCallback(() => {
    setInstructionModalOpen(false);
  }, []);

  const handleToggleTriggerExpanded = useCallback(() => {
    setTriggerExpanded((value) => !value);
  }, []);

  const handleIntegrationButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const integrationType = event.currentTarget.dataset.integrationType as
        | IntegrationType
        | undefined;
      if (!integrationType) {
        return;
      }
      onToggleIntegrationChecked(integrationType);
    },
    [onToggleIntegrationChecked],
  );

  const handleSkillButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const skillKey = event.currentTarget.dataset.skillKey;
      if (!skillKey) {
        return;
      }
      onToggleSkillChecked(skillKey);
    },
    [onToggleSkillChecked],
  );

  const handleOpenDeleteDialog = useCallback(() => {
    onShowDeleteDialogChange(true);
  }, [onShowDeleteDialogChange]);

  const handleTabChange = useCallback(
    (key: string) => {
      onTabChange(key as CoworkerTab);
    },
    [onTabChange],
  );

  const handleSelectRun = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const runId = e.currentTarget.dataset.runId;
      if (runId) {
        onSelectRun(runId);
      }
    },
    [onSelectRun],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar — hidden on mobile where the parent provides its own */}
      {!hideHeader && (
        <div className="flex items-center justify-between gap-3 px-3 py-1.5">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <AnimatedTabs activeKey={activeTab} onTabChange={handleTabChange}>
              <AnimatedTab value="instruction">Instruction</AnimatedTab>
              <AnimatedTab value="runs">Runs</AnimatedTab>
              <AnimatedTab value="docs">Docs</AnimatedTab>
              <AnimatedTab value="toolbox">Toolbox</AnimatedTab>
            </AnimatedTabs>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isSaving && <span className="text-muted-foreground shrink-0 text-xs">Saving…</span>}
            <div className="flex items-center gap-1.5">
              <AnimatePresence mode="wait">
                <motion.span
                  key={status}
                  initial={statusTextMotionInitial}
                  animate={statusTextMotionAnimate}
                  exit={statusTextMotionExit}
                  transition={statusTextMotionTransition}
                  className={cn(
                    "text-xs font-medium",
                    status === "on"
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground",
                  )}
                >
                  {status === "on" ? "On" : "Off"}
                </motion.span>
              </AnimatePresence>
              <Switch checked={status === "on"} onCheckedChange={onStatusChange} />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-3 text-xs font-medium"
              onClick={onRun}
              disabled={isRunDisabled}
            >
              {isRunning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Run now
            </Button>
            <button
              type="button"
              onClick={handleOpenDeleteDialog}
              className="text-muted-foreground hover:text-destructive hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              aria-label="Delete coworker"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
            <AlertDialog open={showDeleteDialog} onOpenChange={onShowDeleteDialogChange}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete coworker?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this coworker and all of its run history. This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="bg-destructive hover:bg-destructive/90 text-white"
                  >
                    {isDeleting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
      {/* Tab content — scrollable (or flex when showing inline run) */}
      <div
        className={cn(
          "min-h-0 flex-1",
          activeTab === "runs" && selectedRunId
            ? "flex flex-col overflow-hidden"
            : "overflow-y-auto",
        )}
      >
        {activeTab === "instruction" && (
          <div className="space-y-3 px-4 py-3">
            {/* Name & Username — side-by-side on desktop, stacked on mobile */}
            <div className={cn("gap-3", hideHeader ? "flex flex-col" : "grid grid-cols-2")}>
              <div className="px-1 py-1">
                <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Name
                </label>
                <Input
                  value={name}
                  onChange={onNameChange}
                  placeholder="New Coworker"
                  className="mt-1.5 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="px-1 py-1">
                <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Username
                </label>
                <div className="mt-1.5 flex items-center">
                  <span className="text-muted-foreground text-sm">@</span>
                  <Input
                    value={username}
                    onChange={onUsernameChange}
                    placeholder="my-coworker"
                    className="border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
            </div>

            {/* Instruction preview card */}
            <button
              type="button"
              className="group border-border/30 hover:border-border/50 hover:bg-muted/20 relative w-full cursor-pointer rounded-xl border p-4 text-left transition-all"
              onClick={handleOpenInstructionModal}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Instructions
                </span>
                <span className="text-muted-foreground group-hover:text-foreground flex items-center gap-1 text-xs transition-colors">
                  <Pencil className="h-3 w-3" />
                  Edit
                </span>
              </div>
              {prompt ? (
                <div className="relative max-h-[120px] overflow-hidden">
                  <div className="prose prose-sm dark:prose-invert prose-p:my-1 prose-headings:my-1.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-1.5 prose-code:text-xs max-w-none text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={instructionRemarkPlugins}>{prompt}</ReactMarkdown>
                  </div>
                  <div className="from-background group-hover:from-muted/20 pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t to-transparent" />
                </div>
              ) : (
                <p className="text-muted-foreground/60 text-sm italic">
                  Describe what this coworker should do…
                </p>
              )}
            </button>

            {/* Instruction editor modal */}
            <Dialog open={instructionModalOpen} onOpenChange={setInstructionModalOpen}>
              <DialogContent
                className={cn(
                  "flex max-w-none flex-col gap-0 overflow-hidden p-0",
                  hideHeader
                    ? "h-dvh w-dvw rounded-none border-0"
                    : "h-[min(80dvh,700px)] w-[min(90vw,900px)]",
                )}
                showCloseButton={false}
              >
                <DialogHeader className="border-border/40 flex-row items-center justify-between border-b px-5 py-3.5">
                  <DialogTitle className="text-sm font-semibold">Edit instructions</DialogTitle>
                  <button
                    type="button"
                    onClick={handleCloseInstructionModal}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </DialogHeader>
                {hideHeader ? (
                  /* Mobile: single pane editor, no side-by-side split */
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <textarea
                      className="text-foreground placeholder:text-muted-foreground/50 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed focus:outline-none"
                      value={prompt}
                      onChange={onPromptChange}
                      placeholder="Describe what this coworker should do…&#10;&#10;You can use markdown for formatting:&#10;- **Bold** for emphasis&#10;- `code` for technical terms&#10;- Lists for step-by-step instructions"
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className="grid flex-1 grid-cols-2 divide-x overflow-hidden">
                    {/* Editor pane */}
                    <div className="flex flex-col overflow-hidden">
                      <div className="border-border/40 border-b px-4 py-2">
                        <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                          Write
                        </span>
                      </div>
                      <textarea
                        className="text-foreground placeholder:text-muted-foreground/50 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed focus:outline-none"
                        value={prompt}
                        onChange={onPromptChange}
                        placeholder="Describe what this coworker should do…&#10;&#10;You can use markdown for formatting:&#10;- **Bold** for emphasis&#10;- `code` for technical terms&#10;- Lists for step-by-step instructions"
                        autoFocus
                      />
                    </div>
                    {/* Preview pane */}
                    <div className="bg-muted/20 flex flex-col overflow-hidden">
                      <div className="border-border/40 border-b px-4 py-2">
                        <span className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                          Preview
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto px-4 py-3">
                        {prompt ? (
                          <div className="prose prose-sm dark:prose-invert prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs max-w-none text-sm leading-relaxed">
                            <ReactMarkdown remarkPlugins={instructionRemarkPlugins}>
                              {prompt}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-muted-foreground/40 text-sm italic">
                            Preview will appear here…
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Trigger card */}
            <div className="border-border/20 rounded-xl border">
              <button
                type="button"
                className="hover:bg-muted/20 flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors"
                onClick={handleToggleTriggerExpanded}
              >
                <div>
                  <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Trigger
                  </span>
                  <p className="text-foreground mt-0.5 text-sm">
                    {triggers.find((t) => t.value === triggerType)?.label ?? "Manual only"}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                    triggerExpanded && "rotate-180",
                  )}
                />
              </button>
              <AnimatePresence initial={false}>
                {triggerExpanded && (
                  <motion.div
                    initial={sectionMotionInitial}
                    animate={sectionMotionAnimate}
                    exit={sectionMotionExit}
                    transition={sectionMotionTransition}
                    className="overflow-hidden"
                  >
                    <div className="border-border/40 space-y-3 border-t px-4 pt-3 pb-4">
                      <Select value={triggerType} onValueChange={onTriggerTypeChange}>
                        <SelectTrigger className="h-9 w-full bg-transparent text-sm">
                          <SelectValue placeholder="Select a trigger" />
                        </SelectTrigger>
                        <SelectContent>
                          {triggers.map((trigger) => (
                            <SelectItem key={trigger.value} value={trigger.value}>
                              {trigger.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <AnimatePresence initial={false} mode="wait">
                        {triggerType === "schedule" && (
                          <motion.div
                            key="schedule-settings"
                            className="space-y-3"
                            initial={scheduleMotionInitial}
                            animate={scheduleMotionAnimate}
                            exit={scheduleMotionExit}
                            transition={scheduleMotionTransition}
                            style={scheduleMotionStyle}
                          >
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium">Frequency</label>
                              <Select value={scheduleType} onValueChange={onScheduleTypeChange}>
                                <SelectTrigger className="bg-background h-9 w-full text-sm">
                                  <SelectValue placeholder="Select frequency" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="interval">Every X hours</SelectItem>
                                  <SelectItem value="daily">Daily</SelectItem>
                                  <SelectItem value="weekly">Weekly</SelectItem>
                                  <SelectItem value="monthly">Monthly</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {scheduleType === "interval" && (
                              <div className="space-y-1.5">
                                <label className="text-xs font-medium">Run every</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={1}
                                    max={168}
                                    className="bg-background h-9 w-20 rounded-md border px-3 text-sm"
                                    value={Math.max(1, Math.round(intervalMinutes / 60))}
                                    onChange={onIntervalHoursChange}
                                  />
                                  <span className="text-muted-foreground text-xs">hours</span>
                                </div>
                              </div>
                            )}

                            {(scheduleType === "daily" ||
                              scheduleType === "weekly" ||
                              scheduleType === "monthly") && (
                              <div className="space-y-1.5">
                                <label className="text-xs font-medium">
                                  Time ({localTimezone})
                                </label>
                                <Input
                                  type="time"
                                  step={60}
                                  value={scheduleTime}
                                  onChange={onScheduleTimeChange}
                                  className="bg-background h-9 w-32 appearance-none text-sm [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                />
                              </div>
                            )}

                            {scheduleType === "weekly" && (
                              <div className="space-y-1.5">
                                <label className="text-xs font-medium">Days of the week</label>
                                <div className="flex flex-wrap gap-1.5">
                                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day, index) => (
                                    <button
                                      key={day}
                                      type="button"
                                      data-day-index={index}
                                      className={cn(
                                        "h-8 w-10 rounded-md border text-xs font-medium transition-colors",
                                        scheduleDaysOfWeek.includes(index)
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : "bg-background hover:bg-muted",
                                      )}
                                      onClick={onToggleWeekDay}
                                    >
                                      {day}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {scheduleType === "monthly" && (
                              <div className="space-y-1.5">
                                <label className="text-xs font-medium">Day of the month</label>
                                <Select
                                  value={String(scheduleDayOfMonth)}
                                  onValueChange={onScheduleDayOfMonthChange}
                                >
                                  <SelectTrigger className="bg-background h-9 w-20 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                      <SelectItem key={day} value={String(day)}>
                                        {day}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {triggerType === EMAIL_FORWARDED_TRIGGER_TYPE && (
                        <div className="bg-muted/20 space-y-3 rounded-lg border p-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Forwarding address</label>
                            {hasActiveForwardingAlias ? (
                              <div className="flex flex-col gap-2">
                                <Input
                                  type="text"
                                  value={coworkerForwardingAddress ?? ""}
                                  disabled
                                  className="bg-background/60 font-mono text-xs"
                                  placeholder="Set RESEND_RECEIVING_DOMAIN to enable forwarding aliases"
                                />
                                <div className="flex gap-1.5">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={onCopyCoworkerAlias}
                                    disabled={!coworkerForwardingAddress}
                                  >
                                    {copiedForwardingField === "coworkerAlias" ? "Copied" : "Copy"}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={onRotateCoworkerAlias}
                                    disabled={rotateForwardingAlias.isPending}
                                  >
                                    Rotate
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={onDisableCoworkerAlias}
                                    disabled={disableForwardingAlias.isPending}
                                  >
                                    Disable
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <Input
                                  type="text"
                                  value=""
                                  disabled
                                  className="bg-background/60 font-mono text-xs"
                                  placeholder="No forwarding address yet"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={onCreateCoworkerAlias}
                                  disabled={
                                    createForwardingAlias.isPending ||
                                    !coworkerForwardingAlias?.receivingDomain ||
                                    !isEmailTriggerPersisted
                                  }
                                >
                                  Create email
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Approval policy card */}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Approval policy
                </span>
                <p className="text-foreground mt-0.5 text-sm">
                  {autoApprove ? "Auto-approve all write actions" : "Manual approval required"}
                </p>
              </div>
              <Switch checked={autoApprove} onCheckedChange={onAutoApproveChange} />
            </div>

            {/* Model card */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Model
              </span>
              <ModelSelector
                selectedModel={model}
                selectedAuthSource={modelAuthSource}
                providerAvailability={providerAvailability}
                onSelectionChange={onModelChange}
              />
            </div>

            {/* Description card */}
            <div className="px-4 py-3">
              <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Description
              </label>
              <textarea
                className="text-foreground placeholder:text-muted-foreground/60 mt-1.5 min-h-[80px] w-full resize-none bg-transparent text-sm leading-relaxed focus:outline-none"
                value={description}
                onChange={onDescriptionChange}
                placeholder="What does this coworker do?"
              />
            </div>
          </div>
        )}

        {activeTab === "runs" && (
          <AnimatePresence mode="wait" initial={false}>
            {selectedRunId ? (
              <motion.div
                key="run-viewer"
                initial={runViewerMotionInitial}
                animate={runViewerMotionAnimate}
                exit={runViewerMotionExit}
                transition={runMotionTransition}
                className="flex min-h-0 flex-1 flex-col"
              >
                <InlineRunViewer runId={selectedRunId} onBack={onBackToRuns} />
              </motion.div>
            ) : (
              <motion.div
                key="run-list"
                initial={runListMotionInitial}
                animate={runListMotionAnimate}
                exit={runListMotionExit}
                transition={runMotionTransition}
                className="px-4 py-3"
              >
                {runs && runs.length > 0 ? (
                  <div className="-mx-1">
                    {runs.map((run) => (
                      <button
                        key={run.id}
                        type="button"
                        data-run-id={run.id}
                        onClick={handleSelectRun}
                        className="hover:bg-muted/40 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors"
                      >
                        <Circle
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 fill-current",
                            run.status === "completed"
                              ? "text-emerald-500"
                              : run.status === "running" ||
                                  run.status === "awaiting_approval" ||
                                  run.status === "awaiting_auth"
                                ? "text-blue-500"
                                : run.status === "paused"
                                  ? "text-amber-500"
                                  : run.status === "error" || run.status === "cancelled"
                                    ? "text-red-500"
                                    : "text-muted-foreground",
                          )}
                        />
                        <span className="text-foreground/70 text-xs">
                          {getCoworkerRunStatusLabel(run.status)}
                        </span>
                        <span className="text-muted-foreground ml-auto text-xs">
                          {formatRelativeTime(run.startedAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">No runs yet.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {activeTab === "docs" && (
          <div className="px-4 py-3">
            <div className="space-y-3">
              <div className="border-muted-foreground/25 hover:border-muted-foreground/40 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition-colors">
                <Upload className="text-muted-foreground h-8 w-8" />
                <p className="text-muted-foreground text-sm">Drop files here or click to upload</p>
                <Button variant="outline" size="sm" className="mt-1 h-7 text-xs">
                  Browse files
                </Button>
              </div>
              <div className="flex items-center gap-2 py-4">
                <FileText className="text-muted-foreground h-4 w-4" />
                <p className="text-muted-foreground text-xs">No documents added yet.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "toolbox" && (
          <div className="space-y-5 px-4 py-3">
            {/* All tools toggle */}
            <div className="border-border/40 bg-muted/20 flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">All tools allowed</span>
                <p className="text-muted-foreground text-[11px]">
                  When enabled, this coworker can use any connected tool
                </p>
              </div>
              <Switch checked={!restrictTools} onCheckedChange={onRestrictToolsChange} />
            </div>

            {restrictTools && (
              <motion.div
                initial={toolboxRevealInitial}
                animate={toolboxRevealAnimate}
                transition={toolboxRevealTransition}
                className="space-y-5"
              >
                {/* Integrations section */}
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      Integrations
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={onSelectAllIntegrations}
                        disabled={allowedIntegrations.length === allIntegrationTypes.length}
                        className="text-muted-foreground hover:text-foreground text-[10px] font-medium transition-colors disabled:opacity-40"
                      >
                        All
                      </button>
                      <span className="text-muted-foreground/30 text-[10px]">·</span>
                      <button
                        type="button"
                        onClick={onClearIntegrations}
                        disabled={allowedIntegrations.length === 0}
                        className="text-muted-foreground hover:text-foreground text-[10px] font-medium transition-colors disabled:opacity-40"
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {integrationEntries.map(({ key, name: label, logo }) => {
                      const isActive = allowedIntegrations.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          data-integration-type={key}
                          onClick={handleIntegrationButtonClick}
                          className={cn(
                            "group relative flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all duration-150",
                            isActive
                              ? "border-primary/30 bg-primary/5 shadow-sm"
                              : "border-border/40 bg-card hover:border-border/70 opacity-60 hover:opacity-100",
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-white p-1 dark:bg-gray-800",
                              isActive ? "border-primary/20 shadow-sm" : "border-border/40",
                            )}
                          >
                            <Image
                              src={logo}
                              alt={label}
                              width={16}
                              height={16}
                              className="h-4 w-4 object-contain"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] leading-tight font-medium">
                              {label}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1">
                              <span
                                className={cn(
                                  "inline-block h-1.5 w-1.5 rounded-full",
                                  isActive ? "bg-emerald-500" : "bg-muted-foreground/30",
                                )}
                              />
                              <span
                                className={cn(
                                  "text-[9px] font-medium",
                                  isActive
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-muted-foreground/50",
                                )}
                              >
                                {isActive ? "On" : "Off"}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Skills section */}
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      Skills
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-[10px]">
                        {selectedSkillKeys.length}/{availableSkills.length}
                      </span>
                      {selectedSkillKeys.length > 0 && (
                        <button
                          type="button"
                          onClick={onClearSkills}
                          className="text-muted-foreground hover:text-foreground text-[10px] font-medium transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  {isSkillsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                    </div>
                  ) : availableSkills.length === 0 ? (
                    <p className="text-muted-foreground py-4 text-center text-xs">
                      No skills available.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {availableSkills.map((skill) => {
                        const isActive = selectedSkillKeys.includes(skill.key);
                        return (
                          <button
                            key={skill.key}
                            type="button"
                            data-skill-key={skill.key}
                            onClick={handleSkillButtonClick}
                            className={cn(
                              "group relative flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all duration-150",
                              isActive
                                ? "border-primary/30 bg-primary/5 shadow-sm"
                                : "border-border/40 bg-card hover:border-border/70 opacity-60 hover:opacity-100",
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                                isActive
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted/60 text-muted-foreground",
                              )}
                            >
                              <span className="text-sm">
                                {skill.source === "Custom" ? "⚡" : "🔧"}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[12px] leading-tight font-medium">
                                {skill.title}
                              </p>
                              <div className="mt-0.5 flex items-center gap-1">
                                <span
                                  className={cn(
                                    "inline-block h-1.5 w-1.5 rounded-full",
                                    isActive ? "bg-emerald-500" : "bg-muted-foreground/30",
                                  )}
                                />
                                <span
                                  className={cn(
                                    "text-[9px] font-medium uppercase tracking-wide",
                                    isActive
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-muted-foreground/50",
                                  )}
                                >
                                  {skill.source}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              </motion.div>
            )}

            {/* Manage in Toolbox link */}
            <Link
              href="/toolbox"
              className="border-border/40 bg-card hover:bg-muted/30 hover:border-border/70 flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition-colors"
            >
              <span className="text-muted-foreground">Manage in Toolbox</span>
              <ArrowRight className="text-muted-foreground h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
