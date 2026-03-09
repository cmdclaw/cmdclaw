"use client";

import {
  CheckCircle2,
  ExternalLink,
  FileInput,
  FileOutput,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Search,
  Table,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconDisplay } from "@/components/ui/icon-picker";
import { Switch } from "@/components/ui/switch";
import { AnimatedTabs, AnimatedTab } from "@/components/ui/tabs";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  isUnipileMissingCredentialsError,
  UNIPILE_MISSING_CREDENTIALS_MESSAGE,
} from "@/lib/integration-errors";
import {
  isComingSoonIntegration,
  type IntegrationType as IntegrationIconType,
} from "@/lib/integration-icons";
import { cn } from "@/lib/utils";
import {
  useIntegrationList,
  useGetAuthUrl,
  useGoogleAccessStatus,
  useToggleIntegration,
  useDisconnectIntegration,
  useLinkLinkedIn,
  useSkillList,
  useCreateSkill,
  useUpdateSkill,
  useDeleteSkill,
  useRequestGoogleAccess,
} from "@/orpc/hooks";

// ─── Types ──────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "active" | "needs_setup";

type IntegrationType = IntegrationIconType | "whatsapp";

type OAuthIntegrationType = IntegrationIconType;

type GoogleIntegrationType =
  | "gmail"
  | "google_calendar"
  | "google_docs"
  | "google_sheets"
  | "google_drive";

const googleIntegrationTypes = new Set<GoogleIntegrationType>([
  "gmail",
  "google_calendar",
  "google_docs",
  "google_sheets",
  "google_drive",
]);

function isGoogleIntegrationType(type: OAuthIntegrationType): type is GoogleIntegrationType {
  return googleIntegrationTypes.has(type as GoogleIntegrationType);
}

// ─── Integration config ─────────────────────────────────────────────────────────

const integrationConfig: Record<string, { name: string; description: string; icon: string }> = {
  gmail: {
    name: "Google Gmail",
    description: "Read and send emails",
    icon: "/integrations/google-gmail.svg",
  },
  outlook: {
    name: "Outlook Mail",
    description: "Read and send emails",
    icon: "/integrations/outlook.svg",
  },
  outlook_calendar: {
    name: "Outlook Calendar",
    description: "Manage events and calendars",
    icon: "/integrations/outlook-calendar.svg",
  },
  google_calendar: {
    name: "Google Calendar",
    description: "Manage events and calendars",
    icon: "/integrations/google-calendar.svg",
  },
  google_docs: {
    name: "Google Docs",
    description: "Read and edit documents",
    icon: "/integrations/google-docs.svg",
  },
  google_sheets: {
    name: "Google Sheets",
    description: "Read and edit spreadsheets",
    icon: "/integrations/google-sheets.svg",
  },
  google_drive: {
    name: "Google Drive",
    description: "Access and manage files",
    icon: "/integrations/google-drive.svg",
  },
  notion: {
    name: "Notion",
    description: "Search and create pages",
    icon: "/integrations/notion.svg",
  },
  airtable: {
    name: "Airtable",
    description: "Read and update bases",
    icon: "/integrations/airtable.svg",
  },
  slack: {
    name: "Slack",
    description: "Send messages and read channels",
    icon: "/integrations/slack.svg",
  },
  hubspot: {
    name: "HubSpot",
    description: "Manage CRM contacts, deals, and tickets",
    icon: "/integrations/hubspot.svg",
  },
  linkedin: {
    name: "LinkedIn",
    description: "Send messages, manage connections, and post content",
    icon: "/integrations/linkedin.svg",
  },
  salesforce: {
    name: "Salesforce",
    description: "Query and manage CRM records and contacts",
    icon: "/integrations/salesforce.svg",
  },
  dynamics: {
    name: "Microsoft Dynamics 365",
    description: "Manage Dataverse tables and CRM rows",
    icon: "/integrations/dynamics.svg",
  },
  reddit: {
    name: "Reddit",
    description: "Browse, vote, comment, and post on Reddit",
    icon: "/integrations/reddit.svg",
  },
  twitter: {
    name: "X (Twitter)",
    description: "Post tweets, manage followers, and search content",
    icon: "/integrations/twitter.svg",
  },
  whatsapp: {
    name: "WhatsApp",
    description: "Link WhatsApp and pair the bridge with QR",
    icon: "/integrations/whatsapp.svg",
  },
};

const adminPreviewOnlyIntegrations = new Set<IntegrationType>(
  (Object.keys(integrationConfig) as IntegrationType[]).filter((type) => {
    if (type === "whatsapp") {
      return true;
    }
    return isComingSoonIntegration(type as IntegrationIconType);
  }),
);

// ─── Community skills ───────────────────────────────────────────────────────────

type CommunitySkill = {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  icon: React.ReactNode;
  logoUrl?: string;
  category: string;
  enabled: boolean;
};

const COMMUNITY_SKILLS: CommunitySkill[] = [
  {
    id: "agent-browser",
    slug: "agent-browser",
    displayName: "Agent Browser",
    description:
      "Browse the web autonomously — search, navigate, extract data, and interact with pages on behalf of the user.",
    icon: <Globe className="h-5 w-5" />,
    category: "Automation",
    enabled: true,
  },
  {
    id: "fill-pdf",
    slug: "fill-pdf",
    displayName: "Fill PDF",
    description:
      "Fill PDF form fields programmatically from structured data. Supports text fields, checkboxes, and dropdowns.",
    icon: <FileInput className="h-5 w-5" />,
    category: "Documents",
    enabled: true,
  },
  {
    id: "docx",
    slug: "docx",
    displayName: "Docx",
    description:
      "Generate polished Word documents from templates or scratch — headings, tables, images, and custom styles.",
    icon: <FileOutput className="h-5 w-5" />,
    logoUrl: "/integrations/google-docs.svg",
    category: "Documents",
    enabled: true,
  },
  {
    id: "xlsx",
    slug: "xlsx",
    displayName: "Xlsx",
    description:
      "Create and manipulate Excel spreadsheets — multiple sheets, formulas, conditional formatting, and charts.",
    icon: <Table className="h-5 w-5" />,
    logoUrl: "/integrations/google-sheets.svg",
    category: "Documents",
    enabled: false,
  },
  {
    id: "skill-creator",
    slug: "skill-creator",
    displayName: "Skill Creator",
    description:
      "Describe what you need in plain language and this skill generates a fully functional new skill with instructions and files.",
    icon: <Wand2 className="h-5 w-5" />,
    category: "Utilities",
    enabled: true,
  },
];

const CARD_MOTION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { duration: 0.2, ease: "easeOut" },
} as const;

const FADE_IN_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

// ─── Card components ────────────────────────────────────────────────────────────

function IntegrationToolCard({
  type,
  config,
  integration,
  isConnecting,
  connectError,
  isPreviewOnly,
  lacksGoogleAccess,
  onConnect,
  onToggle,
  onDisconnect,
  onRequestGoogleAccess,
}: {
  type: IntegrationType;
  config: { name: string; description: string; icon: string };
  integration: {
    id: string;
    type: string;
    enabled: boolean;
    displayName: string | null;
    setupRequired?: boolean;
  } | null;
  isConnecting: boolean;
  connectError?: string;
  isPreviewOnly: boolean;
  lacksGoogleAccess: boolean;
  onConnect: (type: OAuthIntegrationType) => Promise<void>;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDisconnect: (id: string) => Promise<void>;
  onRequestGoogleAccess: (type: GoogleIntegrationType) => Promise<void>;
}) {
  const isConnected = !!integration;
  const isEnabled = integration?.enabled ?? false;
  const isWhatsApp = type === "whatsapp";
  const isGoogleType = !isWhatsApp && isGoogleIntegrationType(type as OAuthIntegrationType);
  const showGoogleRequest = !integration && isGoogleType && lacksGoogleAccess;

  const handleToggle = useCallback(
    (value: boolean) => {
      if (integration) {
        void onToggle(integration.id, value);
      }
    },
    [integration, onToggle],
  );

  const handleConnect = useCallback(() => {
    if (!isWhatsApp) {
      void onConnect(type as OAuthIntegrationType);
    }
  }, [isWhatsApp, onConnect, type]);

  const handleDisconnect = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (integration) {
        void onDisconnect(integration.id);
      }
    },
    [integration, onDisconnect],
  );

  const handleRequestAccess = useCallback(() => {
    if (isGoogleType) {
      void onRequestGoogleAccess(type as GoogleIntegrationType);
    }
  }, [isGoogleType, onRequestGoogleAccess, type]);
  const handleCardActionClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <motion.div
      layout
      initial={CARD_MOTION.initial}
      animate={CARD_MOTION.animate}
      exit={CARD_MOTION.exit}
      transition={CARD_MOTION.transition}
    >
      <div
        className={cn(
          "border-border/40 bg-card hover:border-border/80 group relative flex min-h-[180px] flex-col rounded-xl border p-5 shadow-sm transition-all duration-200",
          isPreviewOnly && "opacity-50",
          connectError && "border-red-500/30",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white p-1.5 shadow-sm dark:bg-gray-800">
              <Image
                src={config.icon}
                alt={config.name}
                width={22}
                height={22}
                className="h-auto max-h-[22px] w-auto max-w-[22px] object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] leading-tight font-medium">{config.name}</p>
              <div className="mt-1 flex items-center gap-1.5">
                {isConnected ? (
                  <>
                    <span
                      className={cn(
                        "inline-block h-1.5 w-1.5 rounded-full",
                        isEnabled ? "bg-emerald-500" : "bg-amber-500",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        isEnabled
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {isEnabled ? "Connected" : "Disabled"}
                    </span>
                  </>
                ) : isPreviewOnly ? (
                  <span className="text-muted-foreground/60 text-[10px] font-medium">
                    Coming soon
                  </span>
                ) : connectError ? (
                  <>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                    <span className="text-[10px] font-medium text-red-500">Error</span>
                  </>
                ) : (
                  <span className="text-muted-foreground text-[10px] font-medium">
                    Not connected
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Toggle or Connect */}
          <div className="flex shrink-0 items-center" onClick={handleCardActionClick}>
            {isConnected && !integration.setupRequired ? (
              <label className="flex cursor-pointer items-center gap-1.5">
                <Switch checked={isEnabled} onCheckedChange={handleToggle} />
                <span className="text-muted-foreground w-6 text-[11px]">
                  {isEnabled ? "On" : "Off"}
                </span>
              </label>
            ) : !isPreviewOnly && !isWhatsApp ? (
              showGoogleRequest ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleRequestAccess}
                >
                  Request access
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  variant={connectError ? "destructive" : "default"}
                >
                  {isConnecting ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-1.5 h-3 w-3" />
                  )}
                  {isConnecting ? "Connecting" : connectError ? "Retry" : "Connect"}
                </Button>
              )
            ) : isWhatsApp ? (
              <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                <Link href="/integrations/whatsapp">
                  Setup
                  <ExternalLink className="ml-1.5 h-3 w-3" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {/* Description */}
        <p className="text-muted-foreground mt-3 line-clamp-2 text-xs leading-relaxed">
          {config.description}
        </p>

        {/* Error */}
        {connectError && (
          <p className="mt-2 text-[11px] leading-snug text-red-500 dark:text-red-400">
            {connectError}
          </p>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
            Integration
          </span>
          {isConnected && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-muted-foreground hover:text-destructive text-[11px] transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CommunityToolCard({ skill }: { skill: CommunitySkill }) {
  const [enabled, setEnabled] = useState(skill.enabled);
  const handleCardActionClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  return (
    <motion.div
      layout
      initial={CARD_MOTION.initial}
      animate={CARD_MOTION.animate}
      exit={CARD_MOTION.exit}
      transition={CARD_MOTION.transition}
    >
      <Link
        href={`/skills/community/${skill.id}`}
        className={cn(
          "border-border/40 bg-card hover:border-border/80 hover:bg-muted/20 group relative flex h-full min-h-[180px] w-full flex-col rounded-xl border p-5 shadow-sm transition-all duration-200",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "bg-muted/60 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                enabled ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {skill.logoUrl ? (
                <Image
                  src={skill.logoUrl}
                  alt={skill.displayName}
                  width={22}
                  height={22}
                  className="size-[22px]"
                />
              ) : (
                skill.icon
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] leading-tight font-medium">{skill.displayName}</p>
              <span className="text-muted-foreground mt-0.5 block text-[10px] font-medium tracking-wider uppercase">
                {skill.category}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5" onClick={handleCardActionClick}>
            <label className="flex cursor-pointer items-center gap-1.5">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              <span className="text-muted-foreground w-6 text-[11px]">
                {enabled ? "On" : "Off"}
              </span>
            </label>
          </div>
        </div>

        {/* Description */}
        <p className="text-muted-foreground mt-3 line-clamp-2 text-xs leading-relaxed">
          {skill.description}
        </p>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
            Skill
          </span>
          <ExternalLink className="text-muted-foreground/30 group-hover:text-muted-foreground size-3.5 transition-colors" />
        </div>
      </Link>
    </motion.div>
  );
}

function CustomToolCard({
  skill,
  onToggle,
  onDelete,
}: {
  skill: {
    id: string;
    name: string;
    displayName: string;
    description: string;
    icon: string | null;
    enabled: boolean;
  };
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string, displayName: string) => Promise<void>;
}) {
  const handleToggle = useCallback(
    (value: boolean) => {
      void onToggle(skill.id, value);
    },
    [onToggle, skill.id],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void onDelete(skill.id, skill.displayName);
    },
    [onDelete, skill.id, skill.displayName],
  );
  const handleCardActionClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  return (
    <motion.div
      layout
      initial={CARD_MOTION.initial}
      animate={CARD_MOTION.animate}
      exit={CARD_MOTION.exit}
      transition={CARD_MOTION.transition}
    >
      <Link
        href={`/skills/${skill.id}`}
        className={cn(
          "border-border/40 bg-card hover:border-border/80 hover:bg-muted/20 group relative flex h-full min-h-[180px] w-full flex-col rounded-xl border p-5 shadow-sm transition-all duration-200",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-muted/60 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
              <IconDisplay icon={skill.icon} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] leading-tight font-medium">{skill.displayName}</p>
              <span className="text-muted-foreground font-mono text-[10px]">{skill.name}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1" onClick={handleCardActionClick}>
            <label className="flex cursor-pointer items-center gap-1.5">
              <Switch checked={skill.enabled} onCheckedChange={handleToggle} />
              <span className="text-muted-foreground w-6 text-[11px]">
                {skill.enabled ? "On" : "Off"}
              </span>
            </label>
          </div>
        </div>

        {/* Description */}
        <p className="text-muted-foreground mt-3 line-clamp-2 text-xs leading-relaxed">
          {skill.description}
        </p>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
            Custom
          </span>
          <div className="flex items-center gap-0.5" onClick={handleCardActionClick}>
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
              <Link href={`/skills/${skill.id}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive h-7 w-7"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Page content ───────────────────────────────────────────────────────────────

function ToolboxPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useIsAdmin();

  // Integration hooks
  const {
    data: integrations,
    isLoading: integrationsLoading,
    refetch: refetchIntegrations,
  } = useIntegrationList();
  const { data: googleAccessStatus } = useGoogleAccessStatus();
  const getAuthUrl = useGetAuthUrl();
  const requestGoogleAccess = useRequestGoogleAccess();
  const toggleIntegration = useToggleIntegration();
  const disconnectIntegration = useDisconnectIntegration();
  const linkLinkedIn = useLinkLinkedIn();

  // Skill hooks
  const { data: skills, isLoading: skillsLoading, refetch: refetchSkills } = useSkillList();
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const deleteSkill = useDeleteSkill();

  // Local state
  const [connectingType, setConnectingType] = useState<string | null>(null);
  const [integrationConnectErrors, setIntegrationConnectErrors] = useState<
    Partial<Record<OAuthIntegrationType, string>>
  >({});
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [isCreating, setIsCreating] = useState(false);
  const linkedInLinkingRef = useRef(false);

  const isLoading = integrationsLoading || skillsLoading;
  const lacksGoogleAccess = googleAccessStatus?.allowed === false;

  // Integration data
  const integrationsList = useMemo(
    () => (Array.isArray(integrations) ? integrations : []),
    [integrations],
  );
  const connectedIntegrations = useMemo(
    () =>
      new Map<string, (typeof integrationsList)[number]>(integrationsList.map((i) => [i.type, i])),
    [integrationsList],
  );

  const visibleIntegrations = useMemo(
    () =>
      (
        Object.entries(integrationConfig) as [
          IntegrationType,
          (typeof integrationConfig)[IntegrationType],
        ][]
      ).filter(([type]) => isAdmin || !adminPreviewOnlyIntegrations.has(type)),
    [isAdmin],
  );

  // Skill data
  const skillsList = useMemo(() => (Array.isArray(skills) ? skills : []), [skills]);

  // ─── LinkedIn redirect handling ─────────────────────────────────────────────
  useEffect(() => {
    const accountId = searchParams.get("account_id");
    if (accountId && !linkedInLinkingRef.current) {
      linkedInLinkingRef.current = true;
      linkLinkedIn
        .mutateAsync(accountId)
        .then(() => {
          setNotification({ type: "success", message: "LinkedIn connected successfully!" });
          refetchIntegrations();
        })
        .catch(() => {
          setNotification({
            type: "error",
            message: "Failed to connect LinkedIn. Please try again.",
          });
        })
        .finally(() => {
          window.history.replaceState({}, "", "/toolbox");
        });
    }
  }, [searchParams, linkLinkedIn, refetchIntegrations]);

  // ─── URL params handling (OAuth callback) ───────────────────────────────────
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    if (success) {
      queueMicrotask(() => {
        setNotification({ type: "success", message: "Integration connected successfully!" });
      });
      window.history.replaceState({}, "", "/toolbox");
      refetchIntegrations();
    } else if (error) {
      queueMicrotask(() => {
        setNotification({
          type: "error",
          message: `Failed to connect: ${error.replace(/_/g, " ")}`,
        });
      });
      window.history.replaceState({}, "", "/toolbox");
    }
  }, [searchParams, refetchIntegrations]);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // ─── Integration handlers ───────────────────────────────────────────────────
  const handleIntegrationConnect = useCallback(
    async (type: OAuthIntegrationType) => {
      setConnectingType(type);
      setIntegrationConnectErrors((prev) => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
      try {
        const result = await getAuthUrl.mutateAsync({
          type,
          redirectUrl: window.location.href,
        });
        window.location.assign(result.authUrl);
      } catch (error) {
        const message = toErrorMessage(error, "");
        setConnectingType(null);
        setIntegrationConnectErrors((prev) => ({
          ...prev,
          [type]: isUnipileMissingCredentialsError(error)
            ? UNIPILE_MISSING_CREDENTIALS_MESSAGE
            : message.includes("admin approval")
              ? "Google access is restricted. Use Request access first."
              : "Failed to start connection. Please try again.",
        }));
      }
    },
    [getAuthUrl],
  );

  const handleIntegrationToggle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await toggleIntegration.mutateAsync({ id, enabled });
        refetchIntegrations();
      } catch (error) {
        console.error("Failed to toggle integration:", error);
      }
    },
    [refetchIntegrations, toggleIntegration],
  );

  const handleIntegrationDisconnect = useCallback(
    async (id: string) => {
      try {
        await disconnectIntegration.mutateAsync(id);
        refetchIntegrations();
      } catch (error) {
        console.error("Failed to disconnect integration:", error);
      }
    },
    [disconnectIntegration, refetchIntegrations],
  );

  const handleRequestGoogleAccess = useCallback(
    async (type: GoogleIntegrationType) => {
      try {
        await requestGoogleAccess.mutateAsync({ integration: type, source: "integrations" });
        setNotification({
          type: "success",
          message: "Access request sent. We notified the team and will approve your Google access.",
        });
      } catch {
        setNotification({ type: "error", message: "Failed to send access request." });
      }
    },
    [requestGoogleAccess],
  );

  // ─── Skill handlers ────────────────────────────────────────────────────────
  const handleCreateSkill = useCallback(async () => {
    setIsCreating(true);
    try {
      const result = await createSkill.mutateAsync({
        displayName: "New Skill",
        description: "Add a description for this skill",
      });
      router.push(`/skills/${result.id}`);
    } catch {
      setNotification({ type: "error", message: "Failed to create skill." });
      setIsCreating(false);
    }
  }, [createSkill, router]);

  const handleSkillToggle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await updateSkill.mutateAsync({ id, enabled });
        refetchSkills();
      } catch (error) {
        console.error("Failed to toggle skill:", error);
      }
    },
    [refetchSkills, updateSkill],
  );

  const handleSkillDelete = useCallback(
    async (id: string, displayName: string) => {
      if (!confirm(`Are you sure you want to delete "${displayName}"?`)) {
        return;
      }
      try {
        await deleteSkill.mutateAsync(id);
        setNotification({ type: "success", message: `Skill "${displayName}" deleted.` });
        refetchSkills();
      } catch {
        setNotification({ type: "error", message: "Failed to delete skill." });
      }
    },
    [deleteSkill, refetchSkills],
  );

  // ─── Search & filter ───────────────────────────────────────────────────────
  const q = search.toLowerCase().trim();

  const filteredIntegrations = useMemo(() => {
    return visibleIntegrations.filter(([type, config]) => {
      const integration = connectedIntegrations.get(type);
      const isConnected = !!integration;
      const isEnabled = integration?.enabled ?? false;

      // Search filter
      if (
        q &&
        !config.name.toLowerCase().includes(q) &&
        !config.description.toLowerCase().includes(q)
      ) {
        return false;
      }

      // Tab filter
      if (activeTab === "active") {
        return isConnected && isEnabled;
      }
      if (activeTab === "needs_setup") {
        return !isConnected && !adminPreviewOnlyIntegrations.has(type);
      }
      return true;
    });
  }, [visibleIntegrations, q, activeTab, connectedIntegrations]);

  const filteredCustomSkills = useMemo(() => {
    let filtered = skillsList;
    if (q) {
      filtered = filtered.filter(
        (s) =>
          s.displayName.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q),
      );
    }
    if (activeTab === "active") {
      filtered = filtered.filter((s) => s.enabled);
    }
    if (activeTab === "needs_setup") {
      return []; // skills never need setup
    }
    return filtered;
  }, [skillsList, q, activeTab]);

  const filteredCommunitySkills = useMemo(() => {
    let filtered = COMMUNITY_SKILLS;
    if (q) {
      filtered = filtered.filter(
        (s) =>
          s.displayName.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q),
      );
    }
    if (activeTab === "active") {
      filtered = filtered.filter((s) => s.enabled);
    }
    if (activeTab === "needs_setup") {
      return []; // skills never need setup
    }
    return filtered;
  }, [q, activeTab]);

  // ─── Counts ─────────────────────────────────────────────────────────────────
  const totalActive = useMemo(() => {
    const activeIntegrations = visibleIntegrations.filter(([type]) => {
      const integration = connectedIntegrations.get(type);
      return integration?.enabled;
    }).length;
    const activeCustom = skillsList.filter((s) => s.enabled).length;
    const activeCommunity = COMMUNITY_SKILLS.filter((s) => s.enabled).length;
    return activeIntegrations + activeCustom + activeCommunity;
  }, [visibleIntegrations, connectedIntegrations, skillsList]);

  const totalNeedsSetup = useMemo(() => {
    return visibleIntegrations.filter(([type]) => {
      return !connectedIntegrations.get(type) && !adminPreviewOnlyIntegrations.has(type);
    }).length;
  }, [visibleIntegrations, connectedIntegrations]);

  const totalAll = visibleIntegrations.length + skillsList.length + COMMUNITY_SKILLS.length;

  const hasResults =
    filteredIntegrations.length > 0 ||
    filteredCustomSkills.length > 0 ||
    filteredCommunitySkills.length > 0;

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all", label: "All", count: totalAll },
    { id: "active", label: "Active", count: totalActive },
    { id: "needs_setup", label: "Needs Setup", count: totalNeedsSetup },
  ];

  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key as FilterTab);
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">Toolbox</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Integrations, skills, and capabilities for your agent
            </p>
          </div>
          <Button onClick={handleCreateSkill} disabled={isCreating} className="self-start">
            {isCreating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create Skill
          </Button>
        </div>
      </div>

      {/* Notification */}
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
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          {notification.message}
        </div>
      )}

      {/* Filters row */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <AnimatedTabs
          activeKey={activeTab}
          onTabChange={handleTabChange}
          className="w-full grid-cols-3 sm:flex sm:w-fit"
        >
          {tabs.map((tab) => (
            <AnimatedTab key={tab.id} value={tab.id} className="text-[11px] sm:text-sm">
              {tab.label}
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.5 text-[10px] sm:ml-1.5 sm:text-xs",
                  activeTab === tab.id
                    ? "bg-foreground/10 text-foreground/70"
                    : "bg-muted-foreground/15 text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            </AnimatedTab>
          ))}
        </AnimatedTabs>

        <div className="border-border/50 bg-card flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 shadow-sm sm:w-72">
          <Search className="text-muted-foreground/50 size-4 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search tools…"
            className="placeholder:text-muted-foreground/40 w-full bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      ) : !hasResults ? (
        <motion.div
          initial={FADE_IN_MOTION.initial}
          animate={FADE_IN_MOTION.animate}
          className="py-16 text-center"
        >
          <p className="text-muted-foreground text-sm">
            {q
              ? "No tools match your search."
              : activeTab === "active"
                ? "No active tools yet."
                : activeTab === "needs_setup"
                  ? "All integrations are connected."
                  : "No tools available."}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-10">
          {/* Custom Skills section */}
          {filteredCustomSkills.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">My Skills</h2>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Custom skills you&apos;ve created
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">
                  {filteredCustomSkills.length} tool
                  {filteredCustomSkills.length !== 1 ? "s" : ""}
                </p>
              </div>
              <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {filteredCustomSkills.map((skill) => (
                    <CustomToolCard
                      key={skill.id}
                      skill={skill}
                      onToggle={handleSkillToggle}
                      onDelete={handleSkillDelete}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            </section>
          )}

          {/* Integrations section */}
          {filteredIntegrations.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Integrations</h2>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Connect external services to your agent
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">
                  {filteredIntegrations.length} tool
                  {filteredIntegrations.length !== 1 ? "s" : ""}
                </p>
              </div>
              <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {filteredIntegrations.map(([type, config]) => {
                    const integration = connectedIntegrations.get(type) ?? null;
                    return (
                      <IntegrationToolCard
                        key={type}
                        type={type}
                        config={config}
                        integration={integration}
                        isConnecting={connectingType === type}
                        connectError={
                          !integration
                            ? integrationConnectErrors[type as OAuthIntegrationType]
                            : undefined
                        }
                        isPreviewOnly={adminPreviewOnlyIntegrations.has(type)}
                        lacksGoogleAccess={lacksGoogleAccess}
                        onConnect={handleIntegrationConnect}
                        onToggle={handleIntegrationToggle}
                        onDisconnect={handleIntegrationDisconnect}
                        onRequestGoogleAccess={handleRequestGoogleAccess}
                      />
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            </section>
          )}

          {/* Community Skills section */}
          {filteredCommunitySkills.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Community Skills</h2>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Pre-built skills ready to activate
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">
                  {filteredCommunitySkills.length} tool
                  {filteredCommunitySkills.length !== 1 ? "s" : ""}
                </p>
              </div>
              <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {filteredCommunitySkills.map((skill) => (
                    <CommunityToolCard key={skill.id} skill={skill} />
                  ))}
                </AnimatePresence>
              </motion.div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function ToolboxPage() {
  return (
    <Suspense fallback={toolboxFallbackNode}>
      <ToolboxPageContent />
    </Suspense>
  );
}

function ToolboxFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

const toolboxFallbackNode = <ToolboxFallback />;
