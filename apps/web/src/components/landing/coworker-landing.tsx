"use client";

import type { ProviderAuthSource } from "@cmdclaw/core/lib/provider-auth-source";
import type { TemplateCatalogTemplate } from "@cmdclaw/db/template-catalog";
import { DEFAULT_CONNECTED_CHATGPT_MODEL } from "@cmdclaw/core/lib/chat-model-defaults";
import {
  ArrowUp,
  MessageSquareText,
  ShieldCheck,
  Clock,
  Workflow,
  Users,
  Lock,
  GitBranch,
  Building2,
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AttachmentData } from "@/components/prompt-bar";
import type { IntegrationType } from "@/lib/integration-icons";
import type { PromptSegment } from "@/lib/prompt-segments";
import { ModelSelector } from "@/components/chat/model-selector";
import { VoiceIndicator } from "@/components/chat/voice-indicator";
import {
  clearPendingCoworkerPrompt,
  getPendingCoworkerGenerationContent,
  readPendingCoworkerPrompt,
  writePendingCoworkerPrompt,
} from "@/components/landing/pending-coworker-prompt";
import { TemplatePreviewModal } from "@/components/template-preview-modal";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { blobToBase64, useVoiceRecording } from "@/hooks/use-voice-recording";
import { authClient } from "@/lib/auth-client";
import { normalizeChatModelSelection } from "@/lib/chat-model-selection";
import { normalizeGenerationError } from "@/lib/generation-errors";
import {
  INTEGRATION_LOGOS,
  INTEGRATION_DISPLAY_NAMES,
  COWORKER_AVAILABLE_INTEGRATION_TYPES,
} from "@/lib/integration-icons";
import { buildProviderAuthAvailabilityByProvider } from "@/lib/provider-auth-availability";
import { client } from "@/orpc/client";
import { useCreateCoworker, useProviderAuthStatus, useTranscribe } from "@/orpc/hooks";

type HeroPromptExample = {
  department: string;
  color: string;
  segments: PromptSegment[];
  prompt: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_COWORKER_BUILDER_MODEL = DEFAULT_CONNECTED_CHATGPT_MODEL;
// Brandfetch CDN icon URLs (fetched via Brand API)
const BF = {
  salesforce:
    "https://cdn.brandfetch.io/idVE84WdIN/w/400/h/400/theme/dark/icon.jpeg?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  outreach:
    "https://cdn.brandfetch.io/idppFLnf4N/w/150/h/150/theme/dark/icon.png?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  googleCalendar:
    "https://cdn.brandfetch.io/id6O2oGzv-/w/400/h/400/theme/dark/icon.jpeg?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  meta: "https://cdn.brandfetch.io/idWvz5T3V7/w/400/h/400/theme/dark/icon.png?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  slack:
    "https://cdn.brandfetch.io/idJ_HhtG0Z/w/400/h/400/theme/dark/icon.jpeg?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  greenhouse:
    "https://cdn.brandfetch.io/id7baa8wpg/w/400/h/400/theme/dark/icon.jpeg?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  bamboohr:
    "https://cdn.brandfetch.io/idpB2Dvgzu/w/180/h/180/theme/dark/icon.png?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  atlassian:
    "https://cdn.brandfetch.io/idlQIwGMOK/w/400/h/400/theme/dark/icon.png?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  ironclad:
    "https://cdn.brandfetch.io/id2DIJ2hXq/w/400/h/400/theme/dark/icon.jpeg?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  stripe:
    "https://cdn.brandfetch.io/idxAg10C0L/w/480/h/480/theme/dark/icon.jpeg?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  brex: "https://cdn.brandfetch.io/idu49Dl4i8/w/400/h/400/theme/dark/icon.jpeg?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  quickbooks:
    "https://cdn.brandfetch.io/idWrWLZ_I5/w/200/h/200/theme/dark/icon.png?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
  zendesk:
    "https://cdn.brandfetch.io/idNq8SRGPd/w/400/h/400/theme/dark/icon.jpeg?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
} as const;

const HERO_PROMPT_EXAMPLES: HeroPromptExample[] = [
  {
    department: "Sales",
    color: "#3B82F6",
    segments: [
      { type: "text", content: "When a deal in " },
      { type: "brand", name: "Salesforce", icon: BF.salesforce },
      { type: "text", content: " moves to Proposal Sent, draft follow-ups in " },
      { type: "brand", name: "Outreach", icon: BF.outreach },
      { type: "text", content: " and schedule reminders in " },
      { type: "brand", name: "Google Calendar", icon: BF.googleCalendar },
    ],
    prompt:
      "When a deal in Salesforce moves to Proposal Sent, draft follow-ups in Outreach and schedule reminders in Google Calendar.",
  },
  {
    department: "Marketing",
    color: "#F472B6",
    segments: [
      { type: "text", content: "Every morning, compare " },
      { type: "brand", name: "Meta Ads", icon: BF.meta },
      { type: "text", content: " and " },
      { type: "brand", name: "Google Ads", icon: BF.googleCalendar },
      { type: "text", content: " CAC vs yesterday and send a performance digest to " },
      { type: "brand", name: "Slack", icon: BF.slack },
    ],
    prompt:
      "Every morning, compare Meta Ads and Google Ads CAC vs yesterday and send a performance digest to Slack.",
  },
  {
    department: "HR",
    color: "#F59E0B",
    segments: [
      { type: "text", content: "When a candidate is marked Hired in " },
      { type: "brand", name: "Greenhouse", icon: BF.greenhouse },
      { type: "text", content: ", create onboarding tasks in " },
      { type: "brand", name: "BambooHR", icon: BF.bamboohr },
      { type: "text", content: ", " },
      { type: "brand", name: "Jira", icon: BF.atlassian },
      { type: "text", content: ", and " },
      { type: "brand", name: "Google Workspace", icon: BF.googleCalendar },
    ],
    prompt:
      "When a candidate is marked Hired in Greenhouse, create onboarding tasks in BambooHR, Jira, and Google Workspace.",
  },
  {
    department: "Legal",
    color: "#8B5CF6",
    segments: [
      { type: "text", content: "When a new MSA is uploaded to " },
      { type: "brand", name: "Ironclad", icon: BF.ironclad },
      { type: "text", content: ", extract renewal and termination dates and add reminders to " },
      { type: "brand", name: "Google Calendar", icon: BF.googleCalendar },
    ],
    prompt:
      "When a new MSA is uploaded to Ironclad, extract renewal and termination dates and add reminders to Google Calendar.",
  },
  {
    department: "Finance",
    color: "#10B981",
    segments: [
      { type: "text", content: "Every business day, reconcile " },
      { type: "brand", name: "Stripe", icon: BF.stripe },
      { type: "text", content: " and " },
      { type: "brand", name: "Brex", icon: BF.brex },
      { type: "text", content: " transactions in " },
      { type: "brand", name: "QuickBooks", icon: BF.quickbooks },
      { type: "text", content: " and send mismatch reports to " },
      { type: "brand", name: "Slack", icon: BF.slack },
    ],
    prompt:
      "Every business day, reconcile Stripe and Brex transactions in QuickBooks and send mismatch reports to Slack.",
  },
  {
    department: "Support",
    color: "#06B6D4",
    segments: [
      { type: "text", content: "Every hour, triage new " },
      { type: "brand", name: "Zendesk", icon: BF.zendesk },
      {
        type: "text",
        content: " tickets by sentiment, auto-tag priority, and route critical ones to on-call in ",
      },
      { type: "brand", name: "Slack", icon: BF.slack },
    ],
    prompt:
      "Every hour, triage new Zendesk tickets by sentiment, auto-tag priority, and route critical ones to on-call in Slack.",
  },
];

function getTriggerLabel(triggerType: string) {
  const map: Record<string, string> = {
    manual: "Manual",
    schedule: "Scheduled",
    email: "Email",
    webhook: "Webhook",
  };
  return map[triggerType] ?? triggerType;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
  isMobile,
}: {
  template: TemplateCatalogTemplate;
  isMobile: boolean;
}) {
  return (
    <Link
      href={isMobile ? `/template/${template.id}` : `/?preview=${template.id}`}
      scroll={false}
      className="group border-border/60 bg-card relative flex min-h-[170px] w-full flex-col gap-3 rounded-xl border p-4 text-left shadow-sm transition-all duration-150 hover:border-slate-300 hover:bg-slate-100"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm leading-tight font-medium text-slate-900">{template.title}</p>
          <span className="mt-1 inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
            {getTriggerLabel(template.triggerType)}
          </span>
        </div>
        <ArrowUp className="mt-0.5 size-3.5 shrink-0 rotate-45 text-slate-500 transition-colors group-hover:text-slate-700" />
      </div>
      <p className="line-clamp-2 text-xs leading-relaxed text-slate-700">{template.description}</p>
      <div className="mt-auto pt-1">
        <IntegrationLogos integrations={template.integrations} />
      </div>
    </Link>
  );
}

// Landing

const PromptBar = dynamic(() => import("@/components/prompt-bar").then((mod) => mod.PromptBar), {
  ssr: false,
});

// ─── Animated Department Heading ──────────────────────────────────────────────

function AnimatedDepartment({
  department,
  color,
  isActive,
}: {
  department: string;
  color: string;
  isActive: boolean;
}) {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const prevDeptRef = useRef(department);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    // When department changes, start fresh
    if (prevDeptRef.current !== department) {
      prevDeptRef.current = department;
      setDisplayedText("");
      setIsTyping(true);
    }
  }, [department, isActive]);

  // Start typing on mount
  useEffect(() => {
    setIsTyping(true);
  }, []);

  useEffect(() => {
    if (!isTyping || !isActive) {
      return;
    }

    if (displayedText.length < department.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(department.slice(0, displayedText.length + 1));
      }, 70);
      return () => clearTimeout(timeout);
    } else {
      setIsTyping(false);
    }
  }, [displayedText, department, isTyping, isActive]);

  const textStyle = useMemo(() => ({ color }), [color]);

  return (
    <span className="inline-flex items-baseline">
      <span style={textStyle}>{displayedText}</span>
    </span>
  );
}

// ─── Landing ─────────────────────────────────────────────────────────────────

type CoworkerLandingProps = {
  initialHasSession?: boolean;
  initialFirstName?: string | null;
  featuredTemplates: TemplateCatalogTemplate[];
};

function getFirstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/, 1).find(Boolean) ?? null;
}

export function CoworkerLanding({
  initialHasSession = false,
  initialFirstName = null,
  featuredTemplates,
}: CoworkerLandingProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const createCoworker = useCreateCoworker();
  const { data: providerAuthStatus } = useProviderAuthStatus();
  const { isRecording, error: voiceError, startRecording, stopRecording } = useVoiceRecording();
  const { mutateAsync: transcribe } = useTranscribe();
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [model, setModel] = useState(DEFAULT_COWORKER_BUILDER_MODEL);
  const [modelAuthSource, setModelAuthSource] = useState<ProviderAuthSource | null>("shared");
  const [inputPrefillRequest, setInputPrefillRequest] = useState<{
    id: string;
    text: string;
    mode?: "replace" | "append";
  } | null>(null);
  const [activePromptIndex, setActivePromptIndex] = useState(0);
  const [isAnonymous, setShowFooter] = useState(!initialHasSession);
  const [userFirstName, setUserFirstName] = useState<string | null>(initialFirstName);
  const resumePendingPromptRef = useRef(false);
  const isRecordingRef = useRef(false);
  const heroAnimatedPrompts = useMemo(() => HERO_PROMPT_EXAMPLES.map((item) => item.prompt), []);
  const heroRichSegments = useMemo(() => HERO_PROMPT_EXAMPLES.map((item) => item.segments), []);
  const previewId = searchParams.get("preview");
  const providerAvailability = useMemo(
    () =>
      buildProviderAuthAvailabilityByProvider({
        connectedProviders: providerAuthStatus?.connected,
        sharedConnectedProviders: providerAuthStatus?.shared,
      }),
    [providerAuthStatus],
  );

  const activeExample = HERO_PROMPT_EXAMPLES[activePromptIndex % HERO_PROMPT_EXAMPLES.length];
  const loggedInHeadline = userFirstName
    ? `What do you want to automate ${userFirstName}?`
    : "What do you want to automate today?";
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
    async (opts: {
      prompt: string;
      triggerType?: string;
      initialMessage?: string;
      initialAttachments?: AttachmentData[];
    }) => {
      try {
        const result = await createCoworker.mutateAsync({
          name: "",
          triggerType:
            (opts.triggerType as "manual" | "schedule" | "email" | "webhook") ?? "manual",
          prompt: opts.prompt,
          model,
          authSource: modelAuthSource,
          allowedIntegrations: COWORKER_AVAILABLE_INTEGRATION_TYPES,
        });

        const initialMessage = getPendingCoworkerGenerationContent({
          initialMessage: opts.initialMessage ?? "",
          attachments: opts.initialAttachments,
        });
        if (initialMessage) {
          try {
            const { conversationId } = await client.coworker.getOrCreateBuilderConversation({
              id: result.id,
            });
            await client.generation.startGeneration({
              conversationId,
              content: initialMessage,
              model,
              authSource: modelAuthSource,
              autoApprove: true,
              fileAttachments: opts.initialAttachments,
            });
          } catch (error) {
            console.error("Failed to start coworker builder generation:", error);
            toast.error(normalizeGenerationError(error, "start_rpc").message);
            return false;
          }
        }

        window.location.href = `/coworkers/${result.id}`;
      } catch {
        return false;
      }
      return true;
    },
    [createCoworker, model, modelAuthSource],
  );

  const redirectToLogin = useCallback(() => {
    window.location.assign("/login?callbackUrl=%2F");
  }, []);

  const handlePromptComposerSubmit = useCallback(
    async (text: string, attachments?: AttachmentData[]) => {
      if (isCreating) {
        return;
      }

      setIsCreating(true);
      writePendingCoworkerPrompt({
        initialMessage: text,
        attachments,
      });
      let shouldClearPendingPrompt = true;

      try {
        const session = await authClient.getSession().catch(() => null);
        const hasSession = Boolean(session?.data?.session && session?.data?.user);

        if (!hasSession) {
          shouldClearPendingPrompt = false;
          redirectToLogin();
          return;
        }

        const created = await doCreate({
          prompt: "",
          initialMessage: text,
          initialAttachments: attachments,
        });
        if (created) {
          clearPendingCoworkerPrompt();
          return;
        }
      } finally {
        if (shouldClearPendingPrompt) {
          clearPendingCoworkerPrompt();
        }
        setIsCreating(false);
      }
    },
    [doCreate, isCreating, redirectToLogin],
  );

  useEffect(() => {
    let mounted = true;

    authClient
      .getSession()
      .then((result) => {
        if (!mounted) {
          return;
        }

        const hasSession = Boolean(result?.data?.session && result?.data?.user);
        setShowFooter(!hasSession);
        setUserFirstName(hasSession ? getFirstName(result?.data?.user?.name) : null);
      })
      .catch(() => {
        if (mounted) {
          setShowFooter(true);
          setUserFirstName(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isAnonymous || isCreating || resumePendingPromptRef.current) {
      return;
    }

    const pendingPrompt = readPendingCoworkerPrompt();
    if (!pendingPrompt) {
      return;
    }

    resumePendingPromptRef.current = true;
    window.location.replace("/coworkers/new");
  }, [isAnonymous, isCreating]);

  useEffect(() => {
    if (!isMobile || !previewId) {
      return;
    }

    router.replace(`/template/${previewId}`, { scroll: false });
  }, [isMobile, previewId, router]);

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
          id: `landing-voice-prefill-${Date.now()}`,
          text: result.text.trim(),
          mode: "append",
        });
      }
    } catch (error) {
      console.error("Landing transcription error:", error);
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

  return (
    <>
      <div className="relative min-h-screen overflow-x-hidden bg-slate-950">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.22),transparent_55%),radial-gradient(circle_at_80%_10%,rgba(125,211,252,0.2),transparent_45%),linear-gradient(180deg,rgba(2,6,23,0.5)_0%,rgba(2,6,23,0.82)_100%)]" />
          <Image
            src="/landing/brick-building-mobile.avif"
            alt=""
            fill
            priority
            sizes="100vw"
            aria-hidden
            className="animate-[landing-ocean-drift_28s_ease-in-out_infinite_alternate] object-cover object-center opacity-80 saturate-110 md:hidden"
          />
          <Image
            src="/landing/brick-building.avif"
            alt=""
            fill
            priority
            sizes="100vw"
            aria-hidden
            className="hidden animate-[landing-ocean-drift_28s_ease-in-out_infinite_alternate] object-cover object-[74%_60%] opacity-80 saturate-110 md:block lg:object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,8,23,0.24)_0%,rgba(3,8,23,0.5)_45%,rgba(3,8,23,0.76)_100%)]" />
        </div>

        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-20 h-20 bg-gradient-to-b from-transparent to-slate-950/70 sm:hidden" />

        <div className="relative z-10 mx-auto w-full max-w-[1500px] px-6 pb-10">
          {/* ── Top bar ── */}
          {isAnonymous ? (
            <div className="flex items-center justify-end gap-2 pt-5">
              <Button
                variant="outline"
                size="sm"
                asChild
                className="border-white/45 bg-white/80 hover:bg-white"
              >
                <Link href="/login">Log in</Link>
              </Button>
              <Button
                size="sm"
                asChild
                className="bg-slate-950 text-white shadow-[0_16px_32px_rgba(2,6,23,0.35)] hover:bg-slate-900"
              >
                <Link href="/login">Get Started</Link>
              </Button>
            </div>
          ) : null}

          {/* ── Prompt area — centered hero ── */}
          <section className="flex min-h-[62vh] items-center justify-center pt-8 md:min-h-[max(22rem,calc(100dvh-21rem))] md:pt-10 lg:min-h-[max(23rem,calc(100dvh-22rem))] lg:pt-12">
            <div className="mx-auto w-full max-w-3xl">
              <h1 className="mb-3 text-center text-3xl font-semibold tracking-tight text-white drop-shadow-[0_0_30px_rgba(56,189,248,0.25)] md:text-4xl lg:text-5xl">
                {isAnonymous ? (
                  <>
                    What do you want to automate in{" "}
                    <AnimatedDepartment
                      department={activeExample?.department ?? "your team"}
                      color={activeExample?.color ?? "#3B82F6"}
                      isActive
                    />
                    ?
                  </>
                ) : (
                  loggedInHeadline
                )}
              </h1>
              <p className="mb-8 text-center text-base text-white md:text-lg">
                Describe a task and we&apos;ll build it step by step
              </p>
              <PromptBar
                onSubmit={handlePromptComposerSubmit}
                isSubmitting={isCreating}
                disabled={isCreating || isRecording || isProcessingVoice}
                variant="hero"
                placeholder="e.g. Every morning, summarize my unread emails and send me a digest…"
                animatedPlaceholders={heroAnimatedPrompts}
                richAnimatedPlaceholders={heroRichSegments}
                onAnimatedPlaceholderIndexChange={setActivePromptIndex}
                isRecording={isRecording}
                onStartRecording={handleStartRecording}
                onStopRecording={stopRecordingAndTranscribe}
                voiceInteractionMode="toggle"
                prefillRequest={inputPrefillRequest}
                renderModelSelector={!isAnonymous ? modelSelectorNode : undefined}
              />
              {(isRecording || isProcessingVoice || voiceError) && (
                <div className="mt-4">
                  <VoiceIndicator
                    isRecording={isRecording}
                    isProcessing={isProcessingVoice}
                    error={voiceError}
                    variant="hero"
                    recordingLabel="Recording... Click the mic again to stop"
                  />
                </div>
              )}
            </div>
          </section>

          {/* ── Templates ── */}
          <section className="mt-6 pb-10 md:mt-8 md:pb-16 lg:mt-10">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Templates</h2>
                <p className="mt-0.5 text-xs text-white">Start from a pre-built coworker</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="gap-1.5 border-white/45 bg-white/80 hover:bg-white"
              >
                <Link href="/templates">Browse all</Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {featuredTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} isMobile={isMobile} />
              ))}
            </div>
          </section>
        </div>
        {!isMobile ? (
          <TemplatePreviewModal
            template={featuredTemplates.find((template) => template.id === previewId) ?? null}
            closeHref="/"
          />
        ) : null}
      </div>

      {/* ── Landing sections (anonymous only) ── */}
      {isAnonymous ? (
        <>
          {/* ── Problem ── */}
          <section className="bg-background border-border/60 border-t px-6 py-20 md:py-28">
            <div className="mx-auto max-w-[1500px]">
              <p className="text-brand mb-2 text-center text-sm font-semibold tracking-wider uppercase">
                The problem
              </p>
              <h2 className="text-foreground mb-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
                AI agents work for you. But not for your team.
              </h2>
              <p className="text-muted-foreground mx-auto mb-16 max-w-2xl text-center text-base">
                You can build an agent with Claude or GPT in minutes. But when you need it to run
                securely, connect to your company&apos;s tools, and work for your whole team —
                you&apos;re on your own.
              </p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {[
                  {
                    problem: "No security or approvals",
                    description:
                      "AI agents running with your credentials, no audit trail, no way to review actions before they execute. One bad prompt away from disaster.",
                  },
                  {
                    problem: "Missing integrations",
                    description:
                      "Generic AI can search the web. But it can't read your HubSpot pipeline, send Slack messages as you, or update your Salesforce records.",
                  },
                  {
                    problem: "Can't deploy to the team",
                    description:
                      "You built something that works for you. Now try sharing it with 10 people who don't know what a prompt is. Good luck.",
                  },
                ].map((item) => (
                  <div
                    key={item.problem}
                    className="border-border/60 rounded-xl border border-dashed p-6"
                  >
                    <h3 className="text-foreground mb-2 text-sm font-semibold">{item.problem}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Solution ── */}
          <section className="border-border/60 bg-muted/40 border-t px-6 py-20 md:py-28">
            <div className="mx-auto max-w-[1500px]">
              <p className="text-brand mb-2 text-center text-sm font-semibold tracking-wider uppercase">
                The platform
              </p>
              <h2 className="text-foreground mb-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
                Build, secure, and deploy AI agents for your company
              </h2>
              <p className="text-muted-foreground mx-auto mb-16 max-w-2xl text-center text-base">
                CmdClaw is the open infrastructure to go from &quot;it works on my laptop&quot; to
                &quot;the whole team runs it in production.&quot;
              </p>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    icon: ShieldCheck,
                    title: "Approval workflows",
                    description:
                      "Every sensitive action goes through human review. Your AI agent asks permission before sending emails, updating CRM records, or posting messages.",
                  },
                  {
                    icon: Lock,
                    title: "Secure by default",
                    description:
                      "OAuth-based integrations. Sandboxed code execution. Scoped permissions per agent. No credentials in prompts, ever.",
                  },
                  {
                    icon: Users,
                    title: "Built for teams",
                    description:
                      "Shared workspace with shared integrations. Deploy an agent once, your whole team uses it. No one needs to know how prompts work.",
                  },
                  {
                    icon: Workflow,
                    title: "16+ native integrations",
                    description:
                      "Gmail, Slack, HubSpot, Salesforce, Notion, Linear, GitHub, and more. One-click OAuth — not API keys duct-taped together.",
                  },
                  {
                    icon: Clock,
                    title: "Runs without you",
                    description:
                      "Schedule agents on cron, trigger on webhooks, or fire on incoming emails. They run 24/7, not just when you have a browser open.",
                  },
                  {
                    icon: GitBranch,
                    title: "Open source",
                    description:
                      "MIT-licensed. Self-host on your own infrastructure. Audit every line of code. No vendor lock-in, no black boxes.",
                  },
                ].map((feature) => (
                  <div
                    key={feature.title}
                    className="bg-background border-border/60 rounded-xl border p-6 shadow-sm"
                  >
                    <div className="bg-brand/10 text-brand mb-4 flex size-10 items-center justify-center rounded-lg">
                      <feature.icon className="size-5" />
                    </div>
                    <h3 className="text-foreground mb-1.5 text-sm font-semibold">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── How it works ── */}
          <section className="bg-background border-border/60 border-t px-6 py-20 md:py-28">
            <div className="mx-auto max-w-[1500px]">
              <p className="text-brand mb-2 text-center text-sm font-semibold tracking-wider uppercase">
                How it works
              </p>
              <h2 className="text-foreground mb-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
                From prompt to production in minutes
              </h2>
              <p className="text-muted-foreground mx-auto mb-16 max-w-2xl text-center text-base">
                Describe what you need. CmdClaw builds it, secures it, and deploys it.
              </p>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
                {[
                  {
                    step: "1",
                    title: "Describe the agent",
                    description:
                      "Tell CmdClaw what you want in plain English. It picks the right integrations, designs the workflow, and sets up triggers.",
                    icon: MessageSquareText,
                  },
                  {
                    step: "2",
                    title: "Review and approve",
                    description:
                      "Test the agent in your workspace. Every action goes through approval. Fine-tune until it works exactly how you need.",
                    icon: ShieldCheck,
                  },
                  {
                    step: "3",
                    title: "Deploy to your team",
                    description:
                      "Turn it on for everyone. The agent runs on schedule or on trigger — secured, audited, and ready for production.",
                    icon: Building2,
                  },
                ].map((item) => (
                  <div key={item.step} className="flex flex-col items-center text-center">
                    <div className="bg-brand/10 text-brand mb-5 flex size-14 items-center justify-center rounded-2xl">
                      <item.icon className="size-7" />
                    </div>
                    <h3 className="text-foreground mb-2 text-lg font-semibold">{item.title}</h3>
                    <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Integrations ── */}
          <section className="border-border/60 bg-muted/40 border-t px-6 py-20 md:py-28">
            <div className="mx-auto max-w-[1500px]">
              <p className="text-brand mb-2 text-center text-sm font-semibold tracking-wider uppercase">
                Integrations
              </p>
              <h2 className="text-foreground mb-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
                Your agents speak to every tool your team uses
              </h2>
              <p className="text-muted-foreground mx-auto mb-16 max-w-2xl text-center text-base">
                One-click OAuth. Shared across your workspace. No API keys to manage.
              </p>
              <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-4 md:gap-6">
                {(
                  [
                    "google_gmail",
                    "google_calendar",
                    "google_sheets",
                    "google_docs",
                    "google_drive",
                    "slack",
                    "notion",
                    "linear",
                    "github",
                    "airtable",
                    "hubspot",
                    "salesforce",
                    "linkedin",
                    "outlook",
                    "outlook_calendar",
                    "dynamics",
                  ] as const
                ).map((key) => (
                  <div
                    key={key}
                    className="border-border/60 bg-background flex items-center gap-2.5 rounded-full border px-4 py-2 shadow-sm"
                  >
                    <Image
                      src={INTEGRATION_LOGOS[key]}
                      alt={INTEGRATION_DISPLAY_NAMES[key]}
                      width={20}
                      height={20}
                      className="size-5 shrink-0"
                    />
                    <span className="text-foreground text-sm font-medium">
                      {INTEGRATION_DISPLAY_NAMES[key]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── CTA ── */}
          <section className="border-border/60 border-t bg-slate-950 px-6 py-20 md:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="mb-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Stop building agents you can&apos;t deploy
              </h2>
              <p className="mb-8 text-base text-slate-400">
                Start free. Build your first AI coworker in minutes. Deploy it to your team today.
              </p>
              <div className="flex items-center justify-center">
                <Button size="lg" asChild className="bg-white text-slate-950 hover:bg-slate-100">
                  <a
                    href="https://cal.com/hyperstack/try-cmdclaw"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Book a Demo
                  </a>
                </Button>
              </div>
              <div className="mt-4 flex items-center justify-center">
                <a
                  href="https://github.com/baptistecolle/cmdclaw"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  Star us on GitHub
                </a>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {/* ── Footer ── */}
      {isAnonymous ? (
        <footer className="border-border/60 bg-background border-t px-6 py-3 sm:py-5">
          <div className="text-muted-foreground mx-auto flex max-w-[1500px] items-center justify-between text-xs leading-none">
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/baptistecolle/cmdclaw"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
                aria-label="GitHub"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
              </a>
              <a
                href="https://discord.com/invite/NHQy8gXerd"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
                aria-label="Discord"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </a>
            </div>
            <nav className="flex items-center gap-4">
              <a
                href="https://docs.cmdclaw.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Docs
              </a>
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link href="/legal/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link
                href="/legal/privacy-policy"
                className="hover:text-foreground transition-colors"
              >
                Privacy
              </Link>
              <Link href="/support" className="hover:text-foreground transition-colors">
                Support
              </Link>
            </nav>
          </div>
        </footer>
      ) : null}
    </>
  );
}
