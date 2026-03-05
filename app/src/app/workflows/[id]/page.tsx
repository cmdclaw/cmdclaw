"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Loader2, Play, ArrowLeft, ChevronDown, ChevronUp, Circle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatArea } from "@/components/chat/chat-area";
import { useChatSkillStore } from "@/components/chat/chat-skill-store";
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
import { useIsAdmin } from "@/hooks/use-is-admin";
import { EMAIL_FORWARDED_TRIGGER_TYPE } from "@/lib/email-forwarding";
import {
  INTEGRATION_DISPLAY_NAMES,
  INTEGRATION_LOGOS,
  WORKFLOW_AVAILABLE_INTEGRATION_TYPES,
  isComingSoonIntegration,
  type IntegrationType,
} from "@/lib/integration-icons";
import { cn } from "@/lib/utils";
import { getWorkflowRunStatusLabel } from "@/lib/workflow-status";
import {
  useCreateWorkflowForwardingAlias,
  useDisableWorkflowForwardingAlias,
  useRotateWorkflowForwardingAlias,
  useWorkflow,
  useWorkflowForwardingAlias,
  useUpdateWorkflow,
  useWorkflowRuns,
  useTriggerWorkflow,
  useGetOrCreateBuilderConversation,
  usePlatformSkillList,
  useSkillList,
  type WorkflowSchedule,
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
    <div className="border-b">
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

function WorkflowChatPanel({
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
      forceWorkflowQuerySync
      skillSelectionScopeKey={skillSelectionScopeKey}
    />
  );
}

export default function WorkflowEditorPage() {
  const params = useParams<{ id: string }>();
  const workflowId = params?.id;
  const { isAdmin } = useIsAdmin();
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const { data: platformSkills, isLoading: isPlatformSkillsLoading } = usePlatformSkillList();
  const { data: personalSkills, isLoading: isPersonalSkillsLoading } = useSkillList();
  const { data: workflowForwardingAlias } = useWorkflowForwardingAlias(workflowId);
  const { data: runs, refetch: refetchRuns } = useWorkflowRuns(workflowId);
  const updateWorkflow = useUpdateWorkflow();
  const createForwardingAlias = useCreateWorkflowForwardingAlias();
  const disableForwardingAlias = useDisableWorkflowForwardingAlias();
  const rotateForwardingAlias = useRotateWorkflowForwardingAlias();
  const triggerWorkflow = useTriggerWorkflow();
  const getOrCreateBuilderConversation = useGetOrCreateBuilderConversation();

  const [name, setName] = useState("");
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
  const [copiedForwardingField, setCopiedForwardingField] = useState<"workflowAlias" | null>(null);
  const [builderConversationId, setBuilderConversationId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({
    instructions: true,
    skills: true,
    tools: true,
    triggers: true,
    runs: true,
  });

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedEditorRef = useRef(false);
  const initializedWorkflowIdRef = useRef<string | null>(null);
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
  const workflowForwardingAddress = workflowForwardingAlias?.forwardingAddress ?? null;
  const hasActiveForwardingAlias = Boolean(workflowForwardingAlias?.activeAlias);
  const isEmailTriggerPersisted = workflow?.triggerType === EMAIL_FORWARDED_TRIGGER_TYPE;
  const integrationEntries = useMemo(
    () =>
      WORKFLOW_AVAILABLE_INTEGRATION_TYPES.map((key) => ({
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
    () => (workflowId ? `workflow-builder:${workflowId}` : "workflow-builder"),
    [workflowId],
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

  const buildSchedule = useCallback((): WorkflowSchedule | null => {
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

  const getWorkflowUpdateInput = useCallback(() => {
    if (!workflowId) {
      return null;
    }
    return {
      id: workflowId,
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
    workflowId,
  ]);

  const getWorkflowPayloadSignature = useCallback(
    (input: NonNullable<ReturnType<typeof getWorkflowUpdateInput>>) =>
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

  const persistWorkflow = useCallback(
    async (options?: { force?: boolean }) => {
      const input = getWorkflowUpdateInput();
      if (!input) {
        return false;
      }

      const signature = getWorkflowPayloadSignature(input);
      if (!options?.force && signature === lastSavedPayloadRef.current) {
        return true;
      }

      setIsSaving(true);
      try {
        await updateWorkflow.mutateAsync(input);
        lastSavedPayloadRef.current = signature;
        return true;
      } catch (error) {
        console.error("Failed to update workflow:", error);
        setNotification({ type: "error", message: "Failed to save workflow." });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [getWorkflowPayloadSignature, getWorkflowUpdateInput, updateWorkflow],
  );

  useEffect(() => {
    if (!workflow) {
      return;
    }
    if (initializedWorkflowIdRef.current === workflow.id) {
      return;
    }

    const availableIntegrationTypes = WORKFLOW_AVAILABLE_INTEGRATION_TYPES;
    const workflowAllowedIntegrations = (
      (workflow.allowedIntegrations ?? []) as IntegrationType[]
    ).filter((type): type is IntegrationType => availableIntegrationTypes.includes(type));
    const hasRestriction =
      workflowAllowedIntegrations.length > 0 &&
      workflowAllowedIntegrations.length < availableIntegrationTypes.length;

    setName(workflow.name);
    setTriggerType(workflow.triggerType);
    setPrompt(workflow.prompt);
    setAllowedIntegrations(
      hasRestriction || workflowAllowedIntegrations.length === 0
        ? workflowAllowedIntegrations
        : availableIntegrationTypes,
    );
    setRestrictTools(hasRestriction || workflowAllowedIntegrations.length === 0);
    setStatus(workflow.status);
    setAutoApprove(workflow.autoApprove ?? true);

    // Initialize schedule state (when trigger is "schedule")
    const schedule = workflow.schedule as WorkflowSchedule | null;
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
    initializedWorkflowIdRef.current = workflow.id;
    hasInitializedEditorRef.current = true;

    const payloadFromWorkflow = {
      id: workflow.id,
      name: workflow.name,
      status: workflow.status,
      triggerType: workflow.triggerType,
      prompt: workflow.prompt,
      autoApprove: workflow.autoApprove ?? true,
      allowedIntegrations:
        hasRestriction || workflowAllowedIntegrations.length === 0
          ? workflowAllowedIntegrations
          : availableIntegrationTypes,
      schedule: schedule,
    } as const;
    lastSavedPayloadRef.current = getWorkflowPayloadSignature(payloadFromWorkflow);
  }, [getWorkflowPayloadSignature, workflow]);

  // Get or create builder conversation once workflow loads
  useEffect(() => {
    if (!workflow || builderConversationInitializedRef.current) {
      return;
    }
    builderConversationInitializedRef.current = true;
    getOrCreateBuilderConversation.mutate(workflow.id, {
      onSuccess: (result) => {
        setBuilderConversationId(result.conversationId);
      },
    });
  }, [workflow, getOrCreateBuilderConversation]);

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

  const handleCopyForwardingAddress = useCallback(async (value: string, field: "workflowAlias") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedForwardingField(field);
      setTimeout(() => setCopiedForwardingField(null), 1500);
    } catch (error) {
      console.error("Failed to copy forwarding address:", error);
    }
  }, []);

  const handleCopyWorkflowAlias = useCallback(() => {
    if (!workflowForwardingAddress) {
      return;
    }
    void handleCopyForwardingAddress(workflowForwardingAddress, "workflowAlias");
  }, [handleCopyForwardingAddress, workflowForwardingAddress]);

  const handleCreateWorkflowAlias = useCallback(async () => {
    if (!workflowId) {
      return;
    }

    try {
      await createForwardingAlias.mutateAsync(workflowId);
      setNotification({ type: "success", message: "Forwarding address created." });
    } catch (error) {
      console.error("Failed to create forwarding alias:", error);
      setNotification({ type: "error", message: "Failed to create forwarding address." });
    }
  }, [createForwardingAlias, workflowId]);

  const handleRotateWorkflowAlias = useCallback(async () => {
    if (!workflowId) {
      return;
    }

    try {
      await rotateForwardingAlias.mutateAsync(workflowId);
      setNotification({ type: "success", message: "Forwarding address rotated." });
    } catch (error) {
      console.error("Failed to rotate forwarding alias:", error);
      setNotification({ type: "error", message: "Failed to rotate forwarding address." });
    }
  }, [rotateForwardingAlias, workflowId]);

  const handleDisableWorkflowAlias = useCallback(async () => {
    if (!workflowId) {
      return;
    }

    try {
      await disableForwardingAlias.mutateAsync(workflowId);
      setNotification({ type: "success", message: "Forwarding address disabled." });
    } catch (error) {
      console.error("Failed to disable forwarding alias:", error);
      setNotification({ type: "error", message: "Failed to disable forwarding address." });
    }
  }, [disableForwardingAlias, workflowId]);

  useEffect(() => {
    if (!hasInitializedEditorRef.current) {
      return;
    }
    if (!workflowId) {
      return;
    }
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      void persistWorkflow();
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
    persistWorkflow,
    prompt,
    restrictTools,
    scheduleDayOfMonth,
    scheduleDaysOfWeek,
    scheduleTime,
    scheduleType,
    status,
    triggerType,
    workflowId,
  ]);

  const handleRun = useCallback(async () => {
    if (!workflowId || isStartingRun) {
      return;
    }

    setIsStartingRun(true);
    try {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      const saveSucceeded = await persistWorkflow({ force: true });
      if (!saveSucceeded) {
        setNotification({ type: "error", message: "Failed to save workflow before test run." });
        return;
      }

      await triggerWorkflow.mutateAsync({ id: workflowId, payload: {} });
      setNotification({ type: "success", message: "Run started." });
      void refetchRuns();
    } catch (error) {
      console.error("Failed to run workflow:", error);
      setNotification({ type: "error", message: "Failed to start run." });
    } finally {
      setIsStartingRun(false);
    }
  }, [isStartingRun, persistWorkflow, refetchRuns, triggerWorkflow, workflowId]);

  const toggleSection = useCallback((section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const toggleInstructions = useCallback(() => toggleSection("instructions"), [toggleSection]);
  const toggleSkills = useCallback(() => toggleSection("skills"), [toggleSection]);
  const toggleTools = useCallback(() => toggleSection("tools"), [toggleSection]);
  const toggleTriggers = useCallback(() => toggleSection("triggers"), [toggleSection]);
  const toggleRuns = useCallback(() => toggleSection("runs"), [toggleSection]);

  const hasAgentInstructions = prompt.trim().length > 0;
  const workflowDisplayName = workflow?.name?.trim().length ? workflow.name : "New Workflow";

  const handleRunClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void handleRun();
    },
    [handleRun],
  );

  const renderRunsAction = useCallback(
    () => (
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground h-6 gap-1.5 px-2 text-xs"
        onClick={handleRunClick}
        disabled={
          !hasAgentInstructions || status !== "on" || triggerWorkflow.isPending || isStartingRun
        }
      >
        {triggerWorkflow.isPending || isStartingRun ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Play className="h-3 w-3" />
        )}
        Run now
      </Button>
    ),
    [handleRunClick, hasAgentInstructions, isStartingRun, status, triggerWorkflow.isPending],
  );

  const chatPanel = useMemo(
    () => (
      <WorkflowChatPanel
        conversationId={builderConversationId}
        skillSelectionScopeKey={skillSelectionScopeKey}
      />
    ),
    [builderConversationId, skillSelectionScopeKey],
  );

  const settingsPanel = useMemo(
    () => (
      <WorkflowSettingsPanel
        name={name}
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
        workflowForwardingAddress={workflowForwardingAddress}
        workflowForwardingAlias={workflowForwardingAlias}
        isEmailTriggerPersisted={isEmailTriggerPersisted}
        copiedForwardingField={copiedForwardingField}
        runs={runs}
        openSections={openSections}
        createForwardingAlias={createForwardingAlias}
        disableForwardingAlias={disableForwardingAlias}
        rotateForwardingAlias={rotateForwardingAlias}
        onNameChange={handleNameChange}
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
        onCopyWorkflowAlias={handleCopyWorkflowAlias}
        onRotateWorkflowAlias={handleRotateWorkflowAlias}
        onDisableWorkflowAlias={handleDisableWorkflowAlias}
        onCreateWorkflowAlias={handleCreateWorkflowAlias}
        onToggleInstructions={toggleInstructions}
        onToggleSkills={toggleSkills}
        onToggleTools={toggleTools}
        onToggleTriggers={toggleTriggers}
        onToggleRuns={toggleRuns}
        renderRunsAction={renderRunsAction}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dep list tracks all panel props
    [
      name,
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
      workflowForwardingAddress,
      workflowForwardingAlias,
      isEmailTriggerPersisted,
      copiedForwardingField,
      runs,
      openSections,
      createForwardingAlias,
      disableForwardingAlias,
      rotateForwardingAlias,
      handleNameChange,
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
      handleCopyWorkflowAlias,
      handleRotateWorkflowAlias,
      handleDisableWorkflowAlias,
      handleCreateWorkflowAlias,
      toggleInstructions,
      toggleSkills,
      toggleTools,
      toggleTriggers,
      toggleRuns,
      renderRunsAction,
    ],
  );

  if (isLoading || !workflow) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <DualPanelWorkspace
        storageKey="workflow-editor-panels-v2"
        defaultRightWidth={45}
        collapsible
        showTitles={false}
        leftTitle="Chat"
        rightTitle={workflowDisplayName}
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
              If you turn this off, workflow runs can stop and wait for manual approval on write
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

type WorkflowSettingsPanelProps = {
  name: string;
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
  workflowForwardingAddress: string | null;
  workflowForwardingAlias:
    | {
        receivingDomain: string | null;
        activeAlias: unknown | null;
        forwardingAddress: string | null;
      }
    | undefined;
  isEmailTriggerPersisted: boolean;
  copiedForwardingField: "workflowAlias" | null;
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
    runs: boolean;
  };
  createForwardingAlias: { isPending: boolean };
  disableForwardingAlias: { isPending: boolean };
  rotateForwardingAlias: { isPending: boolean };
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  onCopyWorkflowAlias: () => void;
  onRotateWorkflowAlias: () => void;
  onDisableWorkflowAlias: () => void;
  onCreateWorkflowAlias: () => void;
  onToggleInstructions: () => void;
  onToggleSkills: () => void;
  onToggleTools: () => void;
  onToggleTriggers: () => void;
  onToggleRuns: () => void;
  renderRunsAction: () => React.ReactNode;
};

function WorkflowSettingsPanel({
  name,
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
  workflowForwardingAddress,
  workflowForwardingAlias,
  isEmailTriggerPersisted,
  copiedForwardingField,
  runs,
  openSections,
  createForwardingAlias,
  disableForwardingAlias,
  rotateForwardingAlias,
  onNameChange,
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
  onCopyWorkflowAlias,
  onRotateWorkflowAlias,
  onDisableWorkflowAlias,
  onCreateWorkflowAlias,
  onToggleInstructions,
  onToggleSkills,
  onToggleTools,
  onToggleTriggers,
  onToggleRuns,
  renderRunsAction,
}: WorkflowSettingsPanelProps) {
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

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="border-b px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
            <Link href="/workflows">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold focus:outline-none"
            value={name}
            onChange={onNameChange}
            placeholder="New Workflow"
          />
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
          <div className="border-border ml-1 flex shrink-0 items-center gap-1.5 border-l pl-2">
            <span className="text-muted-foreground text-xs">{status === "on" ? "On" : "Off"}</span>
            <Switch checked={status === "on"} onCheckedChange={onStatusChange} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Auto-approve</span>
            <Switch checked={autoApprove} onCheckedChange={onAutoApproveChange} />
          </div>
        </div>
        {notification && (
          <p
            className={cn(
              "mt-1.5 text-xs",
              notification.type === "success"
                ? "text-green-700 dark:text-green-400"
                : "text-red-600 dark:text-red-400",
            )}
          >
            {notification.message}
          </p>
        )}
      </div>

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
                {(showAllSkills ? availableSkills : availableSkills.slice(0, 6)).map((skill) => (
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
                ))}
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
                {(showAllIntegrations ? integrationEntries : integrationEntries.slice(0, 4)).map(
                  ({ key, name: label, logo }) => (
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
                  ),
                )}
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
                      value={workflowForwardingAddress ?? ""}
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
                        onClick={onCopyWorkflowAlias}
                        disabled={!workflowForwardingAddress}
                      >
                        {copiedForwardingField === "workflowAlias" ? "Copied" : "Copy"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={onRotateWorkflowAlias}
                        disabled={rotateForwardingAlias.isPending}
                      >
                        Rotate
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={onDisableWorkflowAlias}
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
                      onClick={onCreateWorkflowAlias}
                      disabled={
                        createForwardingAlias.isPending ||
                        !workflowForwardingAlias?.receivingDomain ||
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

      {/* Runs section */}
      <Section
        title="Runs"
        open={openSections.runs}
        onToggle={onToggleRuns}
        renderAction={renderRunsAction}
      >
        {runs && runs.length > 0 ? (
          <div className="-mx-1">
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/workflows/runs/${run.id}`}
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
                  {getWorkflowRunStatusLabel(run.status)}
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
      </Section>
    </div>
  );
}
