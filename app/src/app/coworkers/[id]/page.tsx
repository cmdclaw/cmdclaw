"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Loader2, Play, ChevronDown, ChevronUp, Circle, Upload, FileText } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getCoworkerRunStatusLabel } from "@/lib/coworker-status";
import { EMAIL_FORWARDED_TRIGGER_TYPE } from "@/lib/email-forwarding";
import {
  INTEGRATION_DISPLAY_NAMES,
  INTEGRATION_LOGOS,
  COWORKER_AVAILABLE_INTEGRATION_TYPES,
  isComingSoonIntegration,
  type IntegrationType,
} from "@/lib/integration-icons";
import { cn } from "@/lib/utils";
import {
  useCreateCoworkerForwardingAlias,
  useDisableCoworkerForwardingAlias,
  useRotateCoworkerForwardingAlias,
  useCoworker,
  useCoworkerForwardingAlias,
  useUpdateCoworker,
  useCoworkerRuns,
  useTriggerCoworker,
  useGetOrCreateBuilderConversation,
  usePlatformSkillList,
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
const EMPTY_SELECTED_SKILL_KEYS: string[] = [];

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

function IntegrationToggleSwitch({
  integrationType,
  checked,
  onToggle,
}: {
  integrationType: IntegrationType;
  checked: boolean;
  onToggle: (type: IntegrationType) => void;
}) {
  const handleCheckedChange = useCallback(() => {
    onToggle(integrationType);
  }, [integrationType, onToggle]);

  return <Switch checked={checked} onCheckedChange={handleCheckedChange} />;
}

function Section({
  title,
  open,
  onToggle,
  children,
  renderAction,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  renderAction?: () => React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium"
      >
        <span>{title}</span>
        <div className="flex items-center gap-2">
          {renderAction?.()}
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={sectionMotionInitial}
            animate={sectionMotionAnimate}
            exit={sectionMotionExit}
            transition={sectionMotionTransition}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CoworkerChatPanel({
  conversationId,
  skillSelectionScopeKey,
}: {
  conversationId: string | null;
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
      skillSelectionScopeKey={skillSelectionScopeKey}
    />
  );
}

export default function CoworkerEditorPage() {
  const params = useParams<{ id: string }>();
  const coworkerId = params?.id;
  const { isAdmin } = useIsAdmin();
  const { data: coworker, isLoading } = useCoworker(coworkerId);
  const { data: platformSkills, isLoading: isPlatformSkillsLoading } = usePlatformSkillList();
  const { data: personalSkills, isLoading: isPersonalSkillsLoading } = useSkillList();
  const { data: coworkerForwardingAlias } = useCoworkerForwardingAlias(coworkerId);
  const { data: runs, refetch: refetchRuns } = useCoworkerRuns(coworkerId);
  const updateCoworker = useUpdateCoworker();
  const createForwardingAlias = useCreateCoworkerForwardingAlias();
  const disableForwardingAlias = useDisableCoworkerForwardingAlias();
  const rotateForwardingAlias = useRotateCoworkerForwardingAlias();
  const triggerCoworker = useTriggerCoworker();
  const getOrCreateBuilderConversation = useGetOrCreateBuilderConversation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("manual");
  const [prompt, setPrompt] = useState("");
  const [allowedIntegrations, setAllowedIntegrations] = useState<IntegrationType[]>([]);
  const [restrictTools, setRestrictTools] = useState(false);
  const [status, setStatus] = useState<"on" | "off">("off");
  const [autoApprove, setAutoApprove] = useState(true);
  const [showDisableAutoApproveDialog, setShowDisableAutoApproveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [showAllIntegrations, setShowAllIntegrations] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [copiedForwardingField, setCopiedForwardingField] = useState<"coworkerAlias" | null>(null);
  const [builderConversationId, setBuilderConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"instruction" | "runs" | "docs" | "details">(
    "instruction",
  );
  const [openSections, setOpenSections] = useState({
    instructions: true,
    skills: true,
    tools: true,
    triggers: true,
    approval: false,
    model: false,
  });

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedEditorRef = useRef(false);
  const initializedCoworkerIdRef = useRef<string | null>(null);
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
  const selectedSkillSlugsByScope = useChatSkillStore((state) => state.selectedSkillSlugsByScope);
  const setSelectedSkillSlugs = useChatSkillStore((state) => state.setSelectedSkillSlugs);
  const selectedSkillKeys = useMemo(
    () => selectedSkillSlugsByScope[skillSelectionScopeKey] ?? EMPTY_SELECTED_SKILL_KEYS,
    [selectedSkillSlugsByScope, skillSelectionScopeKey],
  );
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
          key: `custom:${skill.name}`,
          title: skill.displayName,
          source: "Custom" as const,
        })) ?? []),
    ],
    [personalSkills, platformSkills],
  );

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
      status,
      triggerType,
      prompt,
      autoApprove,
      allowedIntegrations: restrictTools ? allowedIntegrations : allIntegrationTypes,
      schedule: buildSchedule(),
    };
  }, [
    allIntegrationTypes,
    allowedIntegrations,
    autoApprove,
    buildSchedule,
    name,
    prompt,
    restrictTools,
    status,
    triggerType,
    coworkerId,
  ]);

  const getCoworkerPayloadSignature = useCallback(
    (input: NonNullable<ReturnType<typeof getCoworkerUpdateInput>>) =>
      JSON.stringify({
        ...input,
        allowedIntegrations: [...input.allowedIntegrations].toSorted(),
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
        setNotification({ type: "error", message: "Failed to save coworker." });
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
    if (initializedCoworkerIdRef.current === coworker.id) {
      return;
    }

    const availableIntegrationTypes = COWORKER_AVAILABLE_INTEGRATION_TYPES;
    const coworkerAllowedIntegrations = (
      (coworker.allowedIntegrations ?? []) as IntegrationType[]
    ).filter((type): type is IntegrationType => availableIntegrationTypes.includes(type));
    const hasRestriction =
      coworkerAllowedIntegrations.length > 0 &&
      coworkerAllowedIntegrations.length < availableIntegrationTypes.length;

    setName(coworker.name);
    setTriggerType(coworker.triggerType);
    setPrompt(coworker.prompt);
    setAllowedIntegrations(
      hasRestriction || coworkerAllowedIntegrations.length === 0
        ? coworkerAllowedIntegrations
        : availableIntegrationTypes,
    );
    setRestrictTools(hasRestriction || coworkerAllowedIntegrations.length === 0);
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
    hasInitializedEditorRef.current = true;

    const payloadFromCoworker = {
      id: coworker.id,
      name: coworker.name,
      status: coworker.status,
      triggerType: coworker.triggerType,
      prompt: coworker.prompt,
      autoApprove: coworker.autoApprove ?? true,
      allowedIntegrations:
        hasRestriction || coworkerAllowedIntegrations.length === 0
          ? coworkerAllowedIntegrations
          : availableIntegrationTypes,
      schedule: schedule,
    } as const;
    lastSavedPayloadRef.current = getCoworkerPayloadSignature(payloadFromCoworker);
  }, [getCoworkerPayloadSignature, coworker]);

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

  useEffect(() => {
    if (!notification) {
      return;
    }
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

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

  const handleRestrictToolsChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        setRestrictTools(false);
        setAllowedIntegrations(allIntegrationTypes);
        return;
      }
      setRestrictTools(true);
    },
    [allIntegrationTypes],
  );

  const handleSelectAllIntegrations = useCallback(() => {
    setAllowedIntegrations(allIntegrationTypes);
  }, [allIntegrationTypes]);

  const handleClearIntegrations = useCallback(() => {
    setAllowedIntegrations([]);
  }, []);

  const handleToggleShowAllIntegrations = useCallback(() => {
    setShowAllIntegrations((prev) => !prev);
  }, []);
  const handleToggleShowAllSkills = useCallback(() => {
    setShowAllSkills((prev) => !prev);
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
      setSelectedSkillSlugs(skillSelectionScopeKey, next);
    },
    [selectedSkillKeys, setSelectedSkillSlugs, skillSelectionScopeKey],
  );
  const handleClearSkills = useCallback(() => {
    setSelectedSkillSlugs(skillSelectionScopeKey, []);
  }, [setSelectedSkillSlugs, skillSelectionScopeKey]);

  const handleDisableAutoApprove = useCallback(() => {
    setAutoApprove(false);
    setShowDisableAutoApproveDialog(false);
  }, []);

  const handleCopyForwardingAddress = useCallback(async (value: string, field: "coworkerAlias") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedForwardingField(field);
      setTimeout(() => setCopiedForwardingField(null), 1500);
    } catch (error) {
      console.error("Failed to copy forwarding address:", error);
    }
  }, []);

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
      setNotification({ type: "success", message: "Forwarding address created." });
    } catch (error) {
      console.error("Failed to create forwarding alias:", error);
      setNotification({ type: "error", message: "Failed to create forwarding address." });
    }
  }, [createForwardingAlias, coworkerId]);

  const handleRotateCoworkerAlias = useCallback(async () => {
    if (!coworkerId) {
      return;
    }

    try {
      await rotateForwardingAlias.mutateAsync(coworkerId);
      setNotification({ type: "success", message: "Forwarding address rotated." });
    } catch (error) {
      console.error("Failed to rotate forwarding alias:", error);
      setNotification({ type: "error", message: "Failed to rotate forwarding address." });
    }
  }, [rotateForwardingAlias, coworkerId]);

  const handleDisableCoworkerAlias = useCallback(async () => {
    if (!coworkerId) {
      return;
    }

    try {
      await disableForwardingAlias.mutateAsync(coworkerId);
      setNotification({ type: "success", message: "Forwarding address disabled." });
    } catch (error) {
      console.error("Failed to disable forwarding alias:", error);
      setNotification({ type: "error", message: "Failed to disable forwarding address." });
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
    name,
    persistCoworker,
    prompt,
    restrictTools,
    scheduleDayOfMonth,
    scheduleDaysOfWeek,
    scheduleTime,
    scheduleType,
    status,
    triggerType,
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
        setNotification({ type: "error", message: "Failed to save coworker before test run." });
        return;
      }

      await triggerCoworker.mutateAsync({ id: coworkerId, payload: {} });
      setNotification({ type: "success", message: "Run started." });
      void refetchRuns();
    } catch (error) {
      console.error("Failed to run coworker:", error);
      setNotification({ type: "error", message: "Failed to start run." });
    } finally {
      setIsStartingRun(false);
    }
  }, [isStartingRun, persistCoworker, refetchRuns, triggerCoworker, coworkerId]);

  const toggleSection = useCallback((section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const toggleInstructions = useCallback(() => toggleSection("instructions"), [toggleSection]);
  const toggleSkills = useCallback(() => toggleSection("skills"), [toggleSection]);
  const toggleTools = useCallback(() => toggleSection("tools"), [toggleSection]);
  const toggleTriggers = useCallback(() => toggleSection("triggers"), [toggleSection]);
  const toggleApproval = useCallback(() => toggleSection("approval"), [toggleSection]);
  const toggleModel = useCallback(() => toggleSection("model"), [toggleSection]);

  const hasAgentInstructions = prompt.trim().length > 0;
  const coworkerDisplayName = coworker?.name?.trim().length ? coworker.name : "New Coworker";

  const handleRunClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void handleRun();
    },
    [handleRun],
  );

  const isRunDisabled =
    !hasAgentInstructions || status !== "on" || triggerCoworker.isPending || isStartingRun;
  const isRunning = triggerCoworker.isPending || isStartingRun;

  const chatPanel = useMemo(
    () => (
      <CoworkerChatPanel
        conversationId={builderConversationId}
        skillSelectionScopeKey={skillSelectionScopeKey}
      />
    ),
    [builderConversationId, skillSelectionScopeKey],
  );

  const settingsPanel = useMemo(
    () => (
      <CoworkerSettingsPanel
        name={name}
        description={description}
        isSaving={isSaving}
        notification={notification}
        status={status}
        autoApprove={autoApprove}
        prompt={prompt}
        availableSkills={availableSkills}
        selectedSkillKeys={selectedSkillKeys}
        isSkillsLoading={isPlatformSkillsLoading || isPersonalSkillsLoading}
        showAllSkills={showAllSkills}
        restrictTools={restrictTools}
        allowedIntegrations={allowedIntegrations}
        allIntegrationTypes={allIntegrationTypes}
        integrationEntries={integrationEntries}
        showAllIntegrations={showAllIntegrations}
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
        openSections={openSections}
        activeTab={activeTab}
        isRunDisabled={isRunDisabled}
        isRunning={isRunning}
        createForwardingAlias={createForwardingAlias}
        disableForwardingAlias={disableForwardingAlias}
        rotateForwardingAlias={rotateForwardingAlias}
        onTabChange={setActiveTab}
        onRun={handleRunClick}
        onNameChange={handleNameChange}
        onDescriptionChange={handleDescriptionChange}
        onStatusChange={handleStatusChange}
        onAutoApproveChange={handleAutoApproveChange}
        onPromptChange={handlePromptChange}
        onClearSkills={handleClearSkills}
        onToggleSkillChecked={handleToggleSkillChecked}
        onToggleShowAllSkills={handleToggleShowAllSkills}
        onRestrictToolsChange={handleRestrictToolsChange}
        onSelectAllIntegrations={handleSelectAllIntegrations}
        onClearIntegrations={handleClearIntegrations}
        onToggleShowAllIntegrations={handleToggleShowAllIntegrations}
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
        onToggleInstructions={toggleInstructions}
        onToggleSkills={toggleSkills}
        onToggleTools={toggleTools}
        onToggleTriggers={toggleTriggers}
        onToggleApproval={toggleApproval}
        onToggleModel={toggleModel}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dep list tracks all panel props
    [
      name,
      description,
      isSaving,
      notification,
      status,
      autoApprove,
      prompt,
      availableSkills,
      selectedSkillKeys,
      isPlatformSkillsLoading,
      isPersonalSkillsLoading,
      showAllSkills,
      restrictTools,
      allowedIntegrations,
      allIntegrationTypes,
      integrationEntries,
      showAllIntegrations,
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
      openSections,
      activeTab,
      isRunDisabled,
      isRunning,
      createForwardingAlias,
      disableForwardingAlias,
      rotateForwardingAlias,
      setActiveTab,
      handleRunClick,
      handleNameChange,
      handleDescriptionChange,
      handleStatusChange,
      handleAutoApproveChange,
      handlePromptChange,
      handleClearSkills,
      handleToggleSkillChecked,
      handleToggleShowAllSkills,
      handleRestrictToolsChange,
      handleSelectAllIntegrations,
      handleClearIntegrations,
      handleToggleShowAllIntegrations,
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
      toggleInstructions,
      toggleSkills,
      toggleTools,
      toggleTriggers,
      toggleApproval,
      toggleModel,
    ],
  );

  if (isLoading || !coworker) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <DualPanelWorkspace
        storageKey="coworker-editor-panels-v2"
        defaultRightWidth={45}
        collapsible
        showTitles={false}
        leftTitle="Chat"
        rightTitle={coworkerDisplayName}
        leftPanelClassName="border-0 rounded-none"
        rightPanelClassName="border-0 rounded-none bg-muted/30"
        left={chatPanel}
        right={settingsPanel}
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
              actions. The agent might stay stuck until someone approves in the UI.
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

type CoworkerSettingsPanelProps = {
  name: string;
  description: string;
  isSaving: boolean;
  notification: { type: "success" | "error"; message: string } | null;
  status: "on" | "off";
  autoApprove: boolean;
  prompt: string;
  availableSkills: { key: string; title: string; source: "Platform" | "Custom" }[];
  selectedSkillKeys: string[];
  isSkillsLoading: boolean;
  showAllSkills: boolean;
  restrictTools: boolean;
  allowedIntegrations: IntegrationType[];
  allIntegrationTypes: IntegrationType[];
  integrationEntries: { key: IntegrationType; name: string; logo: string }[];
  showAllIntegrations: boolean;
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
  copiedForwardingField: "coworkerAlias" | null;
  runs:
    | Array<{
        id: string;
        status: string;
        startedAt: Date;
        finishedAt: Date | null;
        errorMessage: string | null;
      }>
    | undefined;
  openSections: {
    instructions: boolean;
    skills: boolean;
    tools: boolean;
    triggers: boolean;
    approval: boolean;
    model: boolean;
  };
  activeTab: "instruction" | "runs" | "docs" | "details";
  isRunDisabled: boolean;
  isRunning: boolean;
  createForwardingAlias: { isPending: boolean };
  disableForwardingAlias: { isPending: boolean };
  rotateForwardingAlias: { isPending: boolean };
  onTabChange: (tab: "instruction" | "runs" | "docs" | "details") => void;
  onRun: (e: React.MouseEvent) => void;
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDescriptionChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onStatusChange: (checked: boolean) => void;
  onAutoApproveChange: (checked: boolean) => void;
  onPromptChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onClearSkills: () => void;
  onToggleSkillChecked: (skillKey: string) => void;
  onToggleShowAllSkills: () => void;
  onRestrictToolsChange: (checked: boolean) => void;
  onSelectAllIntegrations: () => void;
  onClearIntegrations: () => void;
  onToggleShowAllIntegrations: () => void;
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
  onToggleInstructions: () => void;
  onToggleSkills: () => void;
  onToggleTools: () => void;
  onToggleTriggers: () => void;
  onToggleApproval: () => void;
  onToggleModel: () => void;
};

const DEFAULT_COWORKER_MODEL = "anthropic/claude-sonnet-4-6";

function CoworkerSettingsPanel({
  name,
  description,
  isSaving,
  notification,
  status,
  autoApprove,
  prompt,
  availableSkills,
  selectedSkillKeys,
  isSkillsLoading,
  showAllSkills,
  restrictTools,
  allowedIntegrations,
  allIntegrationTypes,
  integrationEntries,
  showAllIntegrations,
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
  openSections,
  activeTab,
  isRunDisabled,
  isRunning,
  createForwardingAlias,
  disableForwardingAlias,
  rotateForwardingAlias,
  onTabChange,
  onRun,
  onNameChange,
  onDescriptionChange,
  onStatusChange,
  onAutoApproveChange,
  onPromptChange,
  onClearSkills,
  onToggleSkillChecked,
  onToggleShowAllSkills,
  onRestrictToolsChange,
  onSelectAllIntegrations,
  onClearIntegrations,
  onToggleShowAllIntegrations,
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
  onToggleInstructions,
  onToggleSkills,
  onToggleTools,
  onToggleTriggers,
  onToggleApproval,
  onToggleModel,
}: CoworkerSettingsPanelProps) {
  const [coworkerModel, setCoworkerModel] = useState(DEFAULT_COWORKER_MODEL);

  const handleSkillInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const skillKey = event.currentTarget.dataset.skillKey;
      if (!skillKey) {
        return;
      }
      onToggleSkillChecked(skillKey);
    },
    [onToggleSkillChecked],
  );

  const handleTabChange = useCallback(
    (key: string) => {
      onTabChange(key as "instruction" | "runs" | "docs" | "details");
    },
    [onTabChange],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center">
          <AnimatedTabs activeKey={activeTab} onTabChange={handleTabChange}>
            <AnimatedTab value="details">Details</AnimatedTab>
            <AnimatedTab value="instruction">Instruction</AnimatedTab>
            <AnimatedTab value="runs">Runs</AnimatedTab>
            <AnimatedTab value="docs">Docs</AnimatedTab>
          </AnimatedTabs>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "shrink-0 text-xs transition-opacity",
              isSaving
                ? "text-muted-foreground opacity-100"
                : notification?.type === "error"
                  ? "text-red-600 opacity-100 dark:text-red-400"
                  : "text-muted-foreground opacity-0",
            )}
          >
            {isSaving ? "Saving…" : "Save failed"}
          </span>
          <Switch checked={status === "on"} onCheckedChange={onStatusChange} />
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
        </div>
      </div>
      {notification && (
        <div className="px-3">
          <p
            className={cn(
              "text-xs",
              notification.type === "success"
                ? "text-green-700 dark:text-green-400"
                : "text-red-600 dark:text-red-400",
            )}
          >
            {notification.message}
          </p>
        </div>
      )}

      {/* Tab content — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "details" && (
          <div className="space-y-4 px-4 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Name</label>
              <Input
                value={name}
                onChange={onNameChange}
                placeholder="New Coworker"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Description</label>
              <textarea
                className="text-foreground placeholder:text-muted-foreground/60 focus:ring-ring min-h-[80px] w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm leading-relaxed focus:ring-1 focus:outline-none"
                value={description}
                onChange={onDescriptionChange}
                placeholder="What does this coworker do?"
              />
            </div>
          </div>
        )}

        {activeTab === "instruction" && (
          <>
            {/* Instructions section */}
            <Section
              title="Instructions"
              open={openSections.instructions}
              onToggle={onToggleInstructions}
            >
              <textarea
                className="text-foreground placeholder:text-muted-foreground/60 min-h-[140px] w-full resize-none rounded-lg border-0 bg-transparent px-0 py-0 text-sm leading-relaxed focus:outline-none"
                value={prompt}
                onChange={onPromptChange}
                placeholder="Describe what this agent should do…"
              />
            </Section>

            <Section title="Skills" open={openSections.skills} onToggle={onToggleSkills}>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs">
                    {selectedSkillKeys.length}/{availableSkills.length} selected
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={selectedSkillKeys.length === 0}
                    onClick={onClearSkills}
                  >
                    Clear
                  </Button>
                </div>
                {isSkillsLoading ? (
                  <p className="text-muted-foreground text-xs">Loading skills…</p>
                ) : availableSkills.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No skills available.</p>
                ) : (
                  <>
                    <div className="-mx-1 grid grid-cols-1">
                      {(showAllSkills ? availableSkills : availableSkills.slice(0, 6)).map(
                        (skill) => (
                          <label
                            key={skill.key}
                            className="hover:bg-muted/40 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors"
                          >
                            <input
                              type="checkbox"
                              data-skill-key={skill.key}
                              className="h-4 w-4"
                              checked={selectedSkillKeys.includes(skill.key)}
                              onChange={handleSkillInputChange}
                            />
                            <span className="text-xs">{skill.title}</span>
                            <span className="text-muted-foreground ml-auto text-[10px] uppercase">
                              {skill.source}
                            </span>
                          </label>
                        ),
                      )}
                    </div>
                    {availableSkills.length > 6 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onToggleShowAllSkills}
                        className="text-muted-foreground h-7 text-xs"
                      >
                        {showAllSkills ? (
                          <>
                            <ChevronUp className="mr-1 h-3 w-3" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="mr-1 h-3 w-3" />
                            {availableSkills.length - 6} more
                          </>
                        )}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Section>

            {/* Tools section */}
            <Section title="Tools" open={openSections.tools} onToggle={onToggleTools}>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-xs">All tools allowed</span>
                  <Switch checked={!restrictTools} onCheckedChange={onRestrictToolsChange} />
                </div>
                {restrictTools && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-muted-foreground text-xs">
                        {allowedIntegrations.length}/{allIntegrationTypes.length} selected
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={allowedIntegrations.length === allIntegrationTypes.length}
                          onClick={onSelectAllIntegrations}
                        >
                          All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={allowedIntegrations.length === 0}
                          onClick={onClearIntegrations}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <div className="-mx-1 grid grid-cols-1">
                      {(showAllIntegrations
                        ? integrationEntries
                        : integrationEntries.slice(0, 4)
                      ).map(({ key, name: label, logo }) => (
                        <label
                          key={key}
                          className="hover:bg-muted/40 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors"
                        >
                          <IntegrationToggleSwitch
                            integrationType={key}
                            checked={allowedIntegrations.includes(key)}
                            onToggle={onToggleIntegrationChecked}
                          />
                          <Image
                            src={logo}
                            alt={label}
                            width={14}
                            height={14}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-xs">{label}</span>
                        </label>
                      ))}
                    </div>
                    {integrationEntries.length > 4 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onToggleShowAllIntegrations}
                        className="text-muted-foreground h-7 text-xs"
                      >
                        {showAllIntegrations ? (
                          <>
                            <ChevronUp className="mr-1 h-3 w-3" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="mr-1 h-3 w-3" />
                            {integrationEntries.length - 4} more
                          </>
                        )}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Section>

            {/* Triggers section */}
            <Section title="Trigger" open={openSections.triggers} onToggle={onToggleTriggers}>
              <div className="space-y-3">
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
                          <label className="text-xs font-medium">Time ({localTimezone})</label>
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
            </Section>

            {/* Approval policy section */}
            <Section
              title="Approval policy"
              open={openSections.approval}
              onToggle={onToggleApproval}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-sm">Auto-approve</span>
                  <p className="text-muted-foreground text-xs">
                    Automatically approve all write actions
                  </p>
                </div>
                <Switch checked={autoApprove} onCheckedChange={onAutoApproveChange} />
              </div>
            </Section>

            {/* Model section */}
            <Section title="Model" open={openSections.model} onToggle={onToggleModel}>
              <div className="space-y-1">
                <ModelSelector selectedModel={coworkerModel} onModelChange={setCoworkerModel} />
              </div>
            </Section>
          </>
        )}

        {activeTab === "runs" && (
          <div className="px-4 py-3">
            {runs && runs.length > 0 ? (
              <div className="-mx-1">
                {runs.map((run) => (
                  <Link
                    key={run.id}
                    href={`/coworkers/runs/${run.id}`}
                    className="hover:bg-muted/40 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors"
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
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">No runs yet.</p>
            )}
          </div>
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
      </div>
    </div>
  );
}
