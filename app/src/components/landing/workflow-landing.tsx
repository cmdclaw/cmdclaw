"use client";

import { ArrowUp } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { IntegrationType } from "@/lib/integration-icons";
import { Button } from "@/components/ui/button";
import { INTEGRATION_LOGOS, WORKFLOW_AVAILABLE_INTEGRATION_TYPES } from "@/lib/integration-icons";
import { cn } from "@/lib/utils";
import { client } from "@/orpc/client";
import { useCreateWorkflow } from "@/orpc/hooks";

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateItem = {
  id: string;
  title: string;
  description: string;
  triggerType: "manual" | "schedule" | "email" | "webhook";
  integrations: IntegrationType[];
  prompt: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WORKFLOW_BUILDER_MODEL = "anthropic/claude-sonnet-4-6";
const HERO_PROMPT_EXAMPLES = [
  {
    department: "Sales",
    prompt:
      "When a deal in Salesforce moves to Proposal Sent, draft follow-ups in Outreach and schedule reminders in Google Calendar.",
  },
  {
    department: "Marketing",
    prompt:
      "Every morning, compare Meta Ads and Google Ads CAC vs yesterday and send a performance digest to Slack.",
  },
  {
    department: "HR",
    prompt:
      "When a candidate is marked Hired in Greenhouse, create onboarding tasks in BambooHR, Jira, and Google Workspace.",
  },
  {
    department: "Legal",
    prompt:
      "When a new MSA is uploaded to Ironclad, extract renewal and termination dates and add reminders to Google Calendar.",
  },
  {
    department: "Finance",
    prompt:
      "Every business day, reconcile Stripe and Brex transactions in QuickBooks and send mismatch reports to Slack.",
  },
  {
    department: "Support",
    prompt:
      "Every hour, triage new Zendesk tickets by sentiment, auto-tag priority, and route critical ones to on-call in Slack.",
  },
] as const;

function getTriggerLabel(triggerType: string) {
  const map: Record<string, string> = {
    manual: "Manual",
    schedule: "Scheduled",
    email: "Email",
    webhook: "Webhook",
  };
  return map[triggerType] ?? triggerType;
}

const FEATURED_TEMPLATES: TemplateItem[] = [
  {
    id: "call-follow-up",
    title: "Send polished follow-ups right after every call",
    description:
      "As soon as a call transcript is ready, draft a personalized follow-up email and create the matching CRM entry.",
    triggerType: "schedule",
    integrations: ["gmail", "hubspot"],
    prompt:
      "When a call transcript is ready, draft a personalized follow-up email summarizing key points and next steps, then log it in HubSpot.",
  },
  {
    id: "company-list-finance-leads",
    title: "Turn your company list into finance leads ready to call",
    description:
      "Process rows from Google Sheets, find decision-makers, enrich contact data, and push to CRM.",
    triggerType: "manual",
    integrations: ["google_sheets", "linkedin", "hubspot"],
    prompt:
      "Process one row at a time from Google Sheets, find the best finance decision-maker, enrich contact data via LinkedIn, and push to HubSpot.",
  },
  {
    id: "calendly-qualify",
    title: "Qualify every new booking before the meeting",
    description:
      "When a meeting is booked, research the person and company then send a concise briefing.",
    triggerType: "webhook",
    integrations: ["google_calendar", "linkedin", "hubspot", "slack"],
    prompt:
      "When a new meeting is booked, research the person and company on LinkedIn, enrich in HubSpot, and send a briefing to Slack.",
  },
  {
    id: "daily-email-digest",
    title: "Summarize unread emails into a morning briefing",
    description:
      "Every morning, read unread emails from the last 24 hours and send a clean digest with action items.",
    triggerType: "schedule",
    integrations: ["gmail"],
    prompt:
      "Every morning at 8am, read my unread emails from the last 24 hours, summarize the most important ones, and send me a digest email with key action items.",
  },
  {
    id: "incident-slack-notify",
    title: "Post GitHub incident alerts to Slack with full context",
    description:
      "When a critical issue is opened on GitHub, gather related PRs and commits, then post a summary to Slack.",
    triggerType: "webhook",
    integrations: ["github", "slack"],
    prompt:
      "When a critical issue is opened on GitHub, gather related PRs and recent commits, then post a rich summary to the #incidents Slack channel.",
  },
  {
    id: "weekly-campaign-report",
    title: "Generate weekly campaign performance reports",
    description:
      "Every Monday, pull campaign metrics from HubSpot and Sheets, generate a summary, and post to Slack.",
    triggerType: "schedule",
    integrations: ["hubspot", "google_sheets", "slack"],
    prompt:
      "Every Monday, pull campaign metrics from HubSpot and Google Sheets, generate a performance summary, and post to Slack.",
  },
  {
    id: "churn-alert",
    title: "Alert your team the moment a customer shows churn signals",
    description:
      "Monitor usage data and support tickets to detect churn risk, then notify the CS team in Slack.",
    triggerType: "schedule",
    integrations: ["hubspot", "slack", "gmail"],
    prompt:
      "Monitor usage data and support tickets daily. When churn risk is detected, notify the CS team in Slack with full context and suggested actions.",
  },
  {
    id: "gmail-to-hubspot-contacts",
    title: "Turn labeled Gmail threads into clean HubSpot contacts",
    description:
      "Apply one Gmail label and this workflow extracts contact details, upserts people in HubSpot, and logs the interaction.",
    triggerType: "email",
    integrations: ["gmail", "hubspot"],
    prompt:
      "When a Gmail thread is labeled, extract contact details from the latest message, upsert the person in HubSpot, and log the interaction.",
  },
];

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
  onSelect,
  loading,
}: {
  template: TemplateItem;
  onSelect: (t: TemplateItem) => void;
  loading: boolean;
}) {
  const handleClick = useCallback(() => {
    onSelect(template);
  }, [onSelect, template]);

  return (
    <button
      className={cn(
        "group border-border/60 bg-card hover:border-slate-300 hover:bg-slate-100 relative flex min-h-[170px] w-full flex-col gap-3 rounded-xl border p-4 text-left shadow-sm transition-all duration-150",
        loading && "pointer-events-none",
      )}
      onClick={handleClick}
      disabled={loading}
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
    </button>
  );
}

// Landing

const PromptComposer = dynamic(
  () => import("@/components/prompt-composer").then((mod) => mod.PromptComposer),
  { ssr: false },
);

export function WorkflowLanding() {
  const createWorkflow = useCreateWorkflow();
  const [isCreating, setIsCreating] = useState(false);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const [activePromptIndex, setActivePromptIndex] = useState(0);
  const heroAnimatedPrompts = useMemo(() => HERO_PROMPT_EXAMPLES.map((item) => item.prompt), []);

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
        return false;
      }
      return true;
    },
    [createWorkflow],
  );

  const handlePromptComposerSubmit = useCallback(
    async (text: string) => {
      if (isCreating) {
        return;
      }
      setIsCreating(true);
      await doCreate({ prompt: "", initialMessage: text });
      setIsCreating(false);
    },
    [doCreate, isCreating],
  );

  const handleTemplateSelect = useCallback(
    async (template: TemplateItem) => {
      if (creatingTemplateId) {
        return;
      }
      setCreatingTemplateId(template.id);
      await doCreate({ prompt: template.prompt, triggerType: template.triggerType });
      setCreatingTemplateId(null);
    },
    [creatingTemplateId, doCreate],
  );

  const activeDepartment =
    HERO_PROMPT_EXAMPLES[activePromptIndex % HERO_PROMPT_EXAMPLES.length]?.department ??
    "your team";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.22),transparent_55%),radial-gradient(circle_at_80%_10%,rgba(125,211,252,0.2),transparent_45%),linear-gradient(180deg,rgba(2,6,23,0.5)_0%,rgba(2,6,23,0.82)_100%)]" />
        <Image
          src="/landing/ocean-bg.jpg"
          alt=""
          fill
          priority
          aria-hidden
          className="animate-[landing-ocean-drift_28s_ease-in-out_infinite_alternate] object-cover opacity-80 saturate-110"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,8,23,0.24)_0%,rgba(3,8,23,0.5)_45%,rgba(3,8,23,0.76)_100%)]" />
      </div>

      <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-20 h-20 bg-gradient-to-b from-transparent to-slate-950/70 sm:hidden" />

      <div className="relative z-10 mx-auto w-full max-w-[1500px] px-6 pb-10">
        {/* ── Prompt area — centered hero ── */}
        <section className="flex min-h-[62vh] items-center justify-center pt-8 md:min-h-[max(22rem,calc(100dvh-21rem))] md:pt-10 lg:min-h-[max(23rem,calc(100dvh-22rem))] lg:pt-12">
          <div className="mx-auto w-full max-w-2xl">
            <h1 className="mb-2 text-center text-xl font-semibold tracking-tight text-white">
              What do you want to automate in {activeDepartment}?
            </h1>
            <p className="mb-6 text-center text-sm text-slate-100/90">
              Describe a task and we&apos;ll build it step by step
            </p>
            <PromptComposer
              onSubmit={handlePromptComposerSubmit}
              isSubmitting={isCreating}
              variant="hero"
              placeholder="e.g. Every morning, summarize my unread emails and send me a digest…"
              animatedPlaceholders={heroAnimatedPrompts}
              onAnimatedPlaceholderIndexChange={setActivePromptIndex}
            />
          </div>
        </section>

        {/* ── Templates ── */}
        <section className="mt-6 md:mt-8 lg:mt-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Templates</h2>
              <p className="mt-0.5 text-xs text-slate-100/85">Start from a pre-built workflow</p>
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
            {FEATURED_TEMPLATES.map((template) => (
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
