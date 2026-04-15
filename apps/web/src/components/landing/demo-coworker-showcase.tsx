"use client";

/* oxlint-disable react-perf/jsx-no-new-object-as-prop -- motion props are declarative animation config */

import { Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { CoworkerAvatar } from "@/components/coworker-avatar";
import { INTEGRATION_LOGOS, type IntegrationType } from "@/lib/integration-icons";

const SHOWCASE_CARD_INITIAL = { opacity: 0, y: 20 } as const;
const SHOWCASE_CARD_WHILE_IN_VIEW = { opacity: 1, y: 0 } as const;
const SHOWCASE_CARD_VIEWPORT = { once: true, margin: "-80px" } as const;
const SHOWCASE_HOVER = { scale: 1.02 } as const;
const SHOWCASE_HOVER_TRANSITION = { type: "spring", stiffness: 300, damping: 25 } as const;
const RECENT_ACTIVITY_INITIAL = { height: 0, opacity: 0 } as const;
const RECENT_ACTIVITY_ANIMATE = { height: "auto", opacity: 1 } as const;
const RECENT_ACTIVITY_EXIT = { height: 0, opacity: 0 } as const;

/* ── Demo data ── */

type ShowcaseCoworker = {
  name: string;
  username: string;
  description: string;
  trigger: string;
  integrations: IntegrationType[];
  lastRun: string;
  recentActions: { integration: IntegrationType; label: string }[];
};

const SHOWCASE_COWORKERS: ShowcaseCoworker[] = [
  {
    name: "Lead Qualifier",
    username: "lead-qualifier",
    description:
      "Scores incoming leads from HubSpot, enriches contacts with Salesforce data, and routes hot leads to the right rep.",
    trigger: "On new lead",
    integrations: ["hubspot", "salesforce"],
    lastRun: "3m ago",
    recentActions: [
      { integration: "hubspot", label: "Listed new contacts" },
      { integration: "salesforce", label: "Enriched lead → Acme Corp" },
      { integration: "hubspot", label: "Updated deal score → 87/100" },
      { integration: "slack", label: "Notified @sarah → hot lead" },
    ],
  },
  {
    name: "Ticket Triage",
    username: "ticket-triage",
    description:
      "Reads support emails, categorizes by urgency, creates tickets in Notion, and pings the right team in Slack.",
    trigger: "Email",
    integrations: ["slack", "notion"],
    lastRun: "1m ago",
    recentActions: [
      { integration: "google_gmail", label: "Read email → Billing issue" },
      { integration: "notion", label: "Created page → Support ticket #412" },
      { integration: "slack", label: "Sent message → #support-urgent" },
      { integration: "notion", label: "Updated priority → High" },
    ],
  },
  {
    name: "Social Monitor",
    username: "social-monitor",
    description:
      "Tracks LinkedIn mentions and competitor posts, drafts responses, and logs engagement insights in Slack.",
    trigger: "Scheduled",
    integrations: ["linkedin", "slack"],
    lastRun: "12m ago",
    recentActions: [
      { integration: "linkedin", label: "Listed mentions → 6 new" },
      { integration: "linkedin", label: "Drafted reply → CTO post" },
      { integration: "slack", label: "Sent summary → #marketing" },
      { integration: "google_sheets", label: "Logged engagement metrics" },
    ],
  },
];

/* ── Showcase Card ── */

function ShowcaseCard({ coworker, index }: { coworker: ShowcaseCoworker; index: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);
  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);
  const transition = useMemo(
    () => ({
      duration: 0.4,
      delay: index * 0.15,
    }),
    [index],
  );

  return (
    <motion.div
      initial={SHOWCASE_CARD_INITIAL}
      whileInView={SHOWCASE_CARD_WHILE_IN_VIEW}
      viewport={SHOWCASE_CARD_VIEWPORT}
      transition={transition}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        whileHover={SHOWCASE_HOVER}
        transition={SHOWCASE_HOVER_TRANSITION}
        className="border-border/60 bg-background space-y-3 rounded-xl border p-5 shadow-sm"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <CoworkerAvatar
              username={coworker.username}
              size={36}
              className="shrink-0 rounded-full"
            />
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm leading-tight font-medium">{coworker.name}</p>
              <p className="text-muted-foreground bg-muted/60 inline-flex rounded-full px-2 py-0.5 font-mono text-[10px]">
                @{coworker.username}
              </p>
            </div>
          </div>
          <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 text-xs font-medium text-green-600 dark:text-green-400">
            <span className="size-2 rounded-full bg-green-500" />
            On
          </div>
        </div>

        {/* Description */}
        <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
          {coworker.description}
        </p>

        {/* Badges */}
        <div className="flex items-center gap-2">
          <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
            {coworker.trigger}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {coworker.integrations.map((key) => (
              <Image
                key={key}
                src={INTEGRATION_LOGOS[key]}
                alt=""
                width={14}
                height={14}
                className="h-3.5 w-auto"
              />
            ))}
          </div>
        </div>

        {/* Last run */}
        <div className="text-muted-foreground/70 text-xs">
          Last run: <span className="text-muted-foreground">Completed</span> · {coworker.lastRun}
        </div>

        {/* Hover-reveal: recent actions */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={RECENT_ACTIVITY_INITIAL}
              animate={RECENT_ACTIVITY_ANIMATE}
              exit={RECENT_ACTIVITY_EXIT}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="border-border/40 space-y-1 border-t pt-3">
                <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-wider uppercase">
                  Recent activity
                </p>
                {coworker.recentActions.map((action, i) => (
                  <motion.div
                    key={action.label}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15, delay: i * 0.08 }}
                    className="flex items-center gap-1.5 py-0.5 text-xs"
                  >
                    <Image
                      src={INTEGRATION_LOGOS[action.integration]}
                      alt=""
                      width={12}
                      height={12}
                      className="h-3 w-auto shrink-0"
                    />
                    <span className="text-foreground/80 font-mono text-[11px]">{action.label}</span>
                    <div className="flex-1" />
                    <Check className="h-2.5 w-2.5 shrink-0 text-green-500" />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/* ── Section ── */

export function CoworkerShowcaseSection() {
  return (
    <section className="border-border/60 bg-muted/40 border-t px-6 py-20 md:py-28">
      <div className="mx-auto max-w-[1500px]">
        <p className="text-brand mb-2 text-center text-sm font-semibold tracking-wider uppercase">
          Your AI team
        </p>
        <h2 className="text-foreground mb-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Coworkers that handle the work for you
        </h2>
        <p className="text-muted-foreground mx-auto mb-16 max-w-2xl text-center text-base">
          Each coworker specializes in a workflow. Hover to see what they&apos;ve been up to.
        </p>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {SHOWCASE_COWORKERS.map((coworker, i) => (
            <ShowcaseCard key={coworker.username} coworker={coworker} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
