"use client";

import { ArrowUp, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { IntegrationType } from "@/lib/integration-icons";
import { TemplatePreviewModal } from "@/components/template-preview-modal";
import { useIsMobile } from "@/hooks/use-mobile";
import { INTEGRATION_LOGOS, INTEGRATION_DISPLAY_NAMES } from "@/lib/integration-icons";
import { cn } from "@/lib/utils";
import { filterTemplates, toggleMultiSelect, type TemplateItem } from "./templates-filters";

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
  "google_gmail",
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
      "As soon as an Aircall transcript is ready, this coworker drafts a personalized follow-up email and creates the matching…",
    triggerType: "webhook",
    integrations: ["google_gmail", "hubspot"],
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
      "When a new meeting is booked, this coworker researches the person and company, sends a concise briefing,…",
    triggerType: "webhook",
    integrations: ["google_calendar", "linkedin", "hubspot", "slack"],
    industry: "Sales",
    useCase: "Meeting Prep",
  },
  {
    id: "deal-decision-makers",
    title: "Map every decision-maker in your top deals automatically",
    description:
      "Every Monday morning, this coworker scans emails, Slack, call notes, and CRM data across your key deals, identifies wh…",
    triggerType: "schedule",
    integrations: ["google_gmail", "slack", "hubspot", "linkedin", "salesforce"],
    industry: "Sales",
    useCase: "Data Enrichment",
  },
  {
    id: "meeting-prep",
    title: "Know who you meet in your next sales call",
    description:
      "Walk into every call already knowing who they are and what they care about. Let your coworker do the homework you never…",
    triggerType: "schedule",
    integrations: ["google_calendar", "linkedin", "slack"],
    industry: "Sales",
    useCase: "Meeting Prep",
  },
  {
    id: "call-transcript-crm",
    title: "Turn every call transcript into CRM-ready deal intelligence",
    description:
      "This coworker polls CloudTalk, extracts structured commercial insight from each transcript, logs clean records in HubSpo…",
    triggerType: "webhook",
    integrations: ["salesforce", "hubspot", "slack"],
    industry: "Sales",
    useCase: "CRM Sync",
  },
  {
    id: "closed-lost-lessons",
    title: "Capture closed-lost lessons before they get buried",
    description:
      "When a HubSpot deal moves to closed-lost, this coworker reviews deal activity, writes a reusable company-level loss…",
    triggerType: "email",
    integrations: ["hubspot", "slack"],
    industry: "Sales",
    useCase: "Reporting",
  },
  {
    id: "gmail-to-hubspot-contacts",
    title: "Turn labeled Gmail threads into clean HubSpot contacts",
    description:
      "Apply one Gmail label and this coworker extracts contact details from the latest message, upserts people in HubSpot, an…",
    triggerType: "email",
    integrations: ["google_gmail", "hubspot"],
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
    integrations: ["hubspot", "slack", "google_gmail"],
    industry: "Customer Success",
    useCase: "Notifications",
  },
  {
    id: "onboarding-checklist",
    title: "Send personalized onboarding sequences to new customers",
    description:
      "When a deal closes in Salesforce, kick off a tailored onboarding email sequence with milestones…",
    triggerType: "webhook",
    integrations: ["salesforce", "google_gmail", "slack"],
    industry: "Customer Success",
    useCase: "Follow-ups",
  },
  {
    id: "invoice-reconciliation",
    title: "Reconcile invoices with payments every week",
    description:
      "Every Friday, match incoming payments against open invoices in Google Sheets and flag discrepancies…",
    triggerType: "schedule",
    integrations: ["google_sheets", "google_gmail", "slack"],
    industry: "Finance",
    useCase: "Reporting",
  },
  {
    id: "candidate-enrichment",
    title: "Enrich candidate profiles as soon as they apply",
    description:
      "When a new application arrives, pull the candidate's LinkedIn profile and prepare a brief for the hiring manager…",
    triggerType: "webhook",
    integrations: ["google_gmail", "linkedin", "notion"],
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

const FILTER_PILL_TRANSITION = { type: "spring", duration: 0.4, bounce: 0.15 } as const;
const TEMPLATE_CARD_MOTION = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { duration: 0.2, ease: "easeOut" },
} as const;
const ACTIVE_PILL_MOTION = {
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.92 },
} as const;
const FADE_IN_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
} as const;

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
        if (!logo) {
          return null;
        }
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

type FilterPillProps<T extends string> = {
  value: T;
  label: string;
  active: boolean;
  onSelect: (value: T) => void;
  iconSrc?: string;
};

function FilterPill<T extends string>({
  value,
  label,
  active,
  onSelect,
  iconSrc,
}: FilterPillProps<T>) {
  const handleClick = useCallback(() => {
    onSelect(value);
  }, [onSelect, value]);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-[border-color,color,background-color] duration-200",
        active
          ? "border-border/70 bg-muted text-foreground"
          : "border-transparent text-muted-foreground hover:border-border/50 hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <AnimatePresence initial={false}>
        {active ? (
          <motion.span
            initial={ACTIVE_PILL_MOTION.initial}
            animate={ACTIVE_PILL_MOTION.animate}
            exit={ACTIVE_PILL_MOTION.exit}
            transition={FILTER_PILL_TRANSITION}
            className="bg-muted absolute inset-0 rounded-full"
          />
        ) : null}
      </AnimatePresence>
      {iconSrc ? (
        <span className="relative">
          <Image src={iconSrc} alt={value} width={14} height={14} className="size-3.5" />
        </span>
      ) : null}
      <span className="relative">{label}</span>
    </button>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function TemplatesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const previewId = searchParams.get("preview");

  const [search, setSearch] = useState("");
  const [activeIndustries, setActiveIndustries] = useState<string[]>([]);
  const [activeUseCases, setActiveUseCases] = useState<string[]>([]);
  const [activeIntegrations, setActiveIntegrations] = useState<IntegrationType[]>([]);

  const clearFilters = useCallback(() => {
    setActiveIndustries([]);
    setActiveUseCases([]);
    setActiveIntegrations([]);
  }, []);

  const toggleIndustry = useCallback((industry: string) => {
    setActiveIndustries((prev) => toggleMultiSelect(prev, industry));
  }, []);

  const toggleUseCase = useCallback((useCase: string) => {
    setActiveUseCases((prev) => toggleMultiSelect(prev, useCase));
  }, []);

  const toggleIntegration = useCallback((integration: IntegrationType) => {
    setActiveIntegrations((prev) => toggleMultiSelect(prev, integration));
  }, []);

  const filtered = useMemo(() => {
    return filterTemplates(TEMPLATES, {
      search,
      industries: activeIndustries,
      useCases: activeUseCases,
      integrations: activeIntegrations,
    });
  }, [search, activeIndustries, activeUseCases, activeIntegrations]);

  const hasActiveFilter =
    activeIndustries.length > 0 || activeUseCases.length > 0 || activeIntegrations.length > 0;
  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  }, []);

  useEffect(() => {
    if (!isMobile || !previewId) {
      return;
    }

    router.replace(`/template/${previewId}`, { scroll: false });
  }, [isMobile, previewId, router]);

  return (
    <>
      <div className="bg-background min-h-screen">
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-16 md:px-8 md:pt-10">
          {/* Header – hidden on mobile to maximize template visibility */}
          <div className="mb-10 hidden md:block">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">Templates</h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Pre-built coworkers ready to deploy
            </p>
          </div>

          {/* Search */}
          <div className="border-border/50 bg-card mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm md:mb-8">
            <Search className="text-muted-foreground/50 size-4 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search templates…"
              className="placeholder:text-muted-foreground/40 w-full bg-transparent text-sm outline-none"
            />
          </div>

          {/* Filters */}
          <div className="mb-3 space-y-1.5 md:mb-10 md:space-y-4">
            {/* Industry pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
              <span className="text-muted-foreground/50 mr-2 hidden w-16 shrink-0 text-[11px] font-medium tracking-wider uppercase md:block">
                Industry
              </span>
              {INDUSTRIES.map((industry) => (
                <FilterPill
                  key={industry}
                  value={industry}
                  label={industry}
                  active={activeIndustries.includes(industry)}
                  onSelect={toggleIndustry}
                />
              ))}
            </div>

            {/* Use case pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
              <span className="text-muted-foreground/50 mr-2 hidden w-16 shrink-0 text-[11px] font-medium tracking-wider uppercase md:block">
                Use case
              </span>
              {USE_CASES.map((useCase) => (
                <FilterPill
                  key={useCase}
                  value={useCase}
                  label={useCase}
                  active={activeUseCases.includes(useCase)}
                  onSelect={toggleUseCase}
                />
              ))}
            </div>

            {/* Integration pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden">
              <span className="text-muted-foreground/50 mr-2 hidden w-16 shrink-0 text-[11px] font-medium tracking-wider uppercase md:block">
                App
              </span>
              {INTEGRATIONS_FILTER.map((integration) => (
                <FilterPill
                  key={integration}
                  value={integration}
                  label={INTEGRATION_DISPLAY_NAMES[integration]}
                  active={activeIntegrations.includes(integration)}
                  onSelect={toggleIntegration}
                  iconSrc={INTEGRATION_LOGOS[integration]}
                />
              ))}
            </div>
          </div>

          {/* Results count & clear */}
          <div className="mb-3 flex items-center justify-between md:mb-5">
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
                  initial={TEMPLATE_CARD_MOTION.initial}
                  animate={TEMPLATE_CARD_MOTION.animate}
                  exit={TEMPLATE_CARD_MOTION.exit}
                  transition={TEMPLATE_CARD_MOTION.transition}
                >
                  <Link
                    href={
                      isMobile ? `/template/${template.id}` : `/templates?preview=${template.id}`
                    }
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
              initial={FADE_IN_MOTION.initial}
              animate={FADE_IN_MOTION.animate}
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
      {!isMobile && <TemplatePreviewModal templateId={previewId} />}
    </>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={null}>
      <TemplatesPageContent />
    </Suspense>
  );
}
