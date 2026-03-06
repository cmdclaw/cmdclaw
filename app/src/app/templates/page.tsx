"use client";

import { ArrowUp, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { IntegrationType } from "@/lib/integration-icons";
import { AppShell } from "@/components/app-shell";
import { TemplatePreviewModal } from "@/components/template-preview-modal";
import { INTEGRATION_LOGOS, INTEGRATION_DISPLAY_NAMES } from "@/lib/integration-icons";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type TemplateItem = {
  id: string;
  title: string;
  description: string;
  triggerType: "manual" | "schedule" | "email" | "webhook";
  integrations: IntegrationType[];
  industry: string;
  useCase: string;
};

// ─── Filter options ──────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Sales",
  "Marketing",
  "Customer Success",
  "Operations",
  "Finance",
  "HR",
  "Engineering",
] as const;

const USE_CASES = [
  "Lead Generation",
  "Follow-ups",
  "Meeting Prep",
  "Data Enrichment",
  "Reporting",
  "CRM Sync",
  "Notifications",
] as const;

const INTEGRATIONS_FILTER: IntegrationType[] = [
  "gmail",
  "hubspot",
  "slack",
  "linkedin",
  "salesforce",
  "google_sheets",
  "google_calendar",
  "notion",
  "github",
  "linear",
] as const;

// ─── Mock data ───────────────────────────────────────────────────────────────

const TEMPLATES: TemplateItem[] = [
  {
    id: "call-follow-up",
    title: "Send polished follow-ups right after every call",
    description:
      "As soon as an Aircall transcript is ready, this workflow drafts a personalized follow-up email and creates the matching…",
    triggerType: "schedule",
    integrations: ["gmail", "hubspot"],
    industry: "Sales",
    useCase: "Follow-ups",
  },
  {
    id: "company-list-finance-leads",
    title: "Turn your company list into finance leads ready to call",
    description:
      "Process one row at a time from Google Sheets, find the best finance decision-maker, enrich contact data, and push…",
    triggerType: "manual",
    integrations: ["google_sheets", "linkedin", "hubspot"],
    industry: "Sales",
    useCase: "Lead Generation",
  },
  {
    id: "calendly-qualify",
    title: "Qualify every new Calendly booking before the meeting",
    description:
      "When a new meeting is booked, this workflow researches the person and company, sends a concise briefing,…",
    triggerType: "webhook",
    integrations: ["google_calendar", "linkedin", "hubspot", "slack"],
    industry: "Sales",
    useCase: "Meeting Prep",
  },
  {
    id: "deal-decision-makers",
    title: "Map every decision-maker in your top deals automatically",
    description:
      "Every Monday morning, this workflow scans emails, Slack, call notes, and CRM data across your key deals, identifies wh…",
    triggerType: "schedule",
    integrations: ["gmail", "slack", "hubspot", "linkedin", "salesforce"],
    industry: "Sales",
    useCase: "Data Enrichment",
  },
  {
    id: "meeting-prep",
    title: "Know who you meet in your next sales call",
    description:
      "Walk into every call already knowing who they are and what they care about. Let your agent do the homework you never…",
    triggerType: "schedule",
    integrations: ["google_calendar", "linkedin", "slack"],
    industry: "Sales",
    useCase: "Meeting Prep",
  },
  {
    id: "call-transcript-crm",
    title: "Turn every call transcript into CRM-ready deal intelligence",
    description:
      "This workflow polls CloudTalk, extracts structured commercial insight from each transcript, logs clean records in HubSpo…",
    triggerType: "webhook",
    integrations: ["salesforce", "hubspot", "slack"],
    industry: "Sales",
    useCase: "CRM Sync",
  },
  {
    id: "closed-lost-lessons",
    title: "Capture closed-lost lessons before they get buried",
    description:
      "When a HubSpot deal moves to closed-lost, this workflow reviews deal activity, writes a reusable company-level loss…",
    triggerType: "email",
    integrations: ["hubspot", "slack"],
    industry: "Sales",
    useCase: "Reporting",
  },
  {
    id: "gmail-to-hubspot-contacts",
    title: "Turn labeled Gmail threads into clean HubSpot contacts",
    description:
      "Apply one Gmail label and this workflow extracts contact details from the latest message, upserts people in HubSpot, an…",
    triggerType: "email",
    integrations: ["gmail", "hubspot"],
    industry: "Sales",
    useCase: "CRM Sync",
  },
  {
    id: "daily-call-list",
    title: "Build a daily call list from your company sheet with verified phone numbers",
    description:
      "Every weekday, reads unprocessed companies from Google Sheets, finds decision-makers in Apollo,…",
    triggerType: "schedule",
    integrations: ["google_sheets", "linkedin", "hubspot"],
    industry: "Sales",
    useCase: "Lead Generation",
  },
  {
    id: "weekly-campaign-report",
    title: "Generate weekly campaign performance reports automatically",
    description:
      "Every Monday, pull campaign metrics from HubSpot and Google Sheets, generate a summary, and post to Slack…",
    triggerType: "schedule",
    integrations: ["hubspot", "google_sheets", "slack"],
    industry: "Marketing",
    useCase: "Reporting",
  },
  {
    id: "lead-scoring-enrichment",
    title: "Score and enrich every new inbound lead instantly",
    description:
      "When a new contact lands in HubSpot, enrich their profile with LinkedIn data and assign a lead score…",
    triggerType: "webhook",
    integrations: ["hubspot", "linkedin", "slack"],
    industry: "Marketing",
    useCase: "Data Enrichment",
  },
  {
    id: "churn-alert",
    title: "Alert your team the moment a customer shows churn signals",
    description:
      "Monitor usage data and support tickets to detect churn risk, then notify the CS team in Slack with context…",
    triggerType: "schedule",
    integrations: ["hubspot", "slack", "gmail"],
    industry: "Customer Success",
    useCase: "Notifications",
  },
  {
    id: "onboarding-checklist",
    title: "Send personalized onboarding sequences to new customers",
    description:
      "When a deal closes in Salesforce, kick off a tailored onboarding email sequence with milestones…",
    triggerType: "webhook",
    integrations: ["salesforce", "gmail", "slack"],
    industry: "Customer Success",
    useCase: "Follow-ups",
  },
  {
    id: "invoice-reconciliation",
    title: "Reconcile invoices with payments every week",
    description:
      "Every Friday, match incoming payments against open invoices in Google Sheets and flag discrepancies…",
    triggerType: "schedule",
    integrations: ["google_sheets", "gmail", "slack"],
    industry: "Finance",
    useCase: "Reporting",
  },
  {
    id: "candidate-enrichment",
    title: "Enrich candidate profiles as soon as they apply",
    description:
      "When a new application arrives, pull the candidate's LinkedIn profile and prepare a brief for the hiring manager…",
    triggerType: "webhook",
    integrations: ["gmail", "linkedin", "notion"],
    industry: "HR",
    useCase: "Data Enrichment",
  },
  {
    id: "incident-slack-notify",
    title: "Post GitHub incident alerts to Slack with full context",
    description:
      "When a critical issue is opened on GitHub, gather related PRs and recent commits, then post a rich summary to Slack…",
    triggerType: "webhook",
    integrations: ["github", "slack"],
    industry: "Engineering",
    useCase: "Notifications",
  },
  {
    id: "ops-daily-standup",
    title: "Compile a daily ops standup from all your tools",
    description:
      "Every morning, pull updates from Linear, Slack, and Google Sheets into a structured standup summary…",
    triggerType: "schedule",
    integrations: ["linear", "slack", "google_sheets"],
    industry: "Operations",
    useCase: "Reporting",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTriggerLabel(triggerType: string) {
  const map: Record<string, string> = {
    manual: "Manual",
    schedule: "Scheduled",
    email: "Email",
    webhook: "Webhook",
  };
  return map[triggerType] ?? triggerType;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function IntegrationLogos({ integrations }: { integrations: IntegrationType[] }) {
  return (
    <div className="flex items-center gap-1">
      {integrations.map((key) => {
        const logo = INTEGRATION_LOGOS[key];
        if (!logo) return null;
        return (
          <Image
            key={key}
            src={logo}
            alt={key}
            width={20}
            height={20}
            className="size-5 shrink-0"
          />
        );
      })}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  groupId,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  groupId: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-200",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
      )}
    >
      {active && (
        <motion.span
          layoutId={`filter-pill-${groupId}`}
          className="bg-muted border-border/60 absolute inset-0 rounded-full border"
          transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
        />
      )}
      {icon && <span className="relative">{icon}</span>}
      <span className="relative">{label}</span>
    </button>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const searchParams = useSearchParams();
  const previewId = searchParams.get("preview");

  const [search, setSearch] = useState("");
  const [activeIndustry, setActiveIndustry] = useState<string | null>(null);
  const [activeUseCase, setActiveUseCase] = useState<string | null>(null);
  const [activeIntegration, setActiveIntegration] = useState<IntegrationType | null>(null);

  const clearFilters = useCallback(() => {
    setActiveIndustry(null);
    setActiveUseCase(null);
    setActiveIntegration(null);
  }, []);

  const toggleIndustry = useCallback(
    (industry: string) => {
      clearFilters();
      setActiveIndustry((prev) => (prev === industry ? null : industry));
    },
    [clearFilters],
  );

  const toggleUseCase = useCallback(
    (useCase: string) => {
      clearFilters();
      setActiveUseCase((prev) => (prev === useCase ? null : useCase));
    },
    [clearFilters],
  );

  const toggleIntegration = useCallback(
    (integration: IntegrationType) => {
      clearFilters();
      setActiveIntegration((prev) => (prev === integration ? null : integration));
    },
    [clearFilters],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return TEMPLATES.filter((t) => {
      if (activeIndustry && t.industry !== activeIndustry) return false;
      if (activeUseCase && t.useCase !== activeUseCase) return false;
      if (activeIntegration && !t.integrations.includes(activeIntegration)) return false;
      if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [search, activeIndustry, activeUseCase, activeIntegration]);

  const hasActiveFilter = activeIndustry || activeUseCase || activeIntegration;

  return (
    <AppShell>
      <div className="bg-background min-h-screen">
        <div className="mx-auto w-full max-w-[1400px] px-8 pt-10 pb-16">
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">Templates</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Pre-built workflows ready to deploy
            </p>
          </div>

          {/* Search */}
          <div className="border-border/50 bg-card mb-8 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm">
            <Search className="text-muted-foreground/50 size-4 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="placeholder:text-muted-foreground/40 w-full bg-transparent text-sm outline-none"
            />
          </div>

          {/* Filters */}
          <div className="mb-10 space-y-4">
            {/* Industry pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground/50 mr-2 w-16 shrink-0 text-[11px] font-medium tracking-wider uppercase">
                Industry
              </span>
              {INDUSTRIES.map((industry) => (
                <FilterPill
                  key={industry}
                  label={industry}
                  active={activeIndustry === industry}
                  onClick={() => toggleIndustry(industry)}
                  groupId="industry"
                />
              ))}
            </div>

            {/* Use case pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground/50 mr-2 w-16 shrink-0 text-[11px] font-medium tracking-wider uppercase">
                Use case
              </span>
              {USE_CASES.map((useCase) => (
                <FilterPill
                  key={useCase}
                  label={useCase}
                  active={activeUseCase === useCase}
                  onClick={() => toggleUseCase(useCase)}
                  groupId="usecase"
                />
              ))}
            </div>

            {/* Integration pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground/50 mr-2 w-16 shrink-0 text-[11px] font-medium tracking-wider uppercase">
                App
              </span>
              {INTEGRATIONS_FILTER.map((integration) => (
                <FilterPill
                  key={integration}
                  label={INTEGRATION_DISPLAY_NAMES[integration]}
                  active={activeIntegration === integration}
                  onClick={() => toggleIntegration(integration)}
                  groupId="integration"
                  icon={
                    <Image
                      src={INTEGRATION_LOGOS[integration]}
                      alt={integration}
                      width={14}
                      height={14}
                      className="size-3.5"
                    />
                  }
                />
              ))}
            </div>
          </div>

          {/* Results count & clear */}
          <div className="mb-5 flex items-center justify-between">
            <p className="text-muted-foreground text-xs">
              {filtered.length} template{filtered.length !== 1 ? "s" : ""}
            </p>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-muted-foreground hover:text-foreground text-xs transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Grid */}
          <motion.div layout className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((template) => (
                <motion.div
                  key={template.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <Link
                    href={`/templates?preview=${template.id}`}
                    scroll={false}
                    className="border-border/40 bg-card hover:border-border/80 hover:bg-muted/20 group relative flex h-full w-full flex-col rounded-xl border p-5 shadow-sm transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] leading-snug font-medium">{template.title}</p>
                      <ArrowUp className="text-muted-foreground/30 group-hover:text-muted-foreground mt-0.5 size-3.5 shrink-0 rotate-45 transition-colors" />
                    </div>

                    <span className="bg-muted text-muted-foreground mt-2.5 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
                      {getTriggerLabel(template.triggerType)}
                    </span>

                    <p className="text-muted-foreground mt-3 line-clamp-2 text-xs leading-relaxed">
                      {template.description}
                    </p>

                    <div className="mt-auto pt-4">
                      <IntegrationLogos integrations={template.integrations} />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-20 text-center"
            >
              <p className="text-muted-foreground text-sm">No templates match your filters.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-muted-foreground hover:text-foreground mt-2 text-xs underline transition-colors"
              >
                Clear all filters
              </button>
            </motion.div>
          )}
        </div>
      </div>

      <TemplatePreviewModal templateId={previewId} />
    </AppShell>
  );
}
