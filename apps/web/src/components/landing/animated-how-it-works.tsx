"use client";

import { Check, Loader2 } from "lucide-react";
import { motion, useInView, useMotionValue, useTransform, animate, AnimatePresence } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import { CoworkerAvatar } from "@/components/coworker-avatar";
import { INTEGRATION_LOGOS, type IntegrationType } from "@/lib/integration-icons";

/* ═══════════════════════════════════════════════════════════════════════════════
   EXAMPLE DATA — each example defines content for all 3 cards
   ═══════════════════════════════════════════════════════════════════════════════ */

type Example = {
  prompt: string;
  agent: {
    name: string;
    username: string;
    integrations: IntegrationType[];
    trigger: string;
  };
  dashboard: {
    rows: { name: string; status: "running" | "completed" | "scheduled"; color: string }[];
    runs: number;
  };
};

const EXAMPLES: Example[] = [
  {
    prompt:
      "When a lead replies on HubSpot, draft a follow-up email and alert the team on Slack",
    agent: {
      name: "Lead Follow-up Agent",
      username: "lead-followup",
      integrations: ["hubspot", "google_gmail", "slack"],
      trigger: "Webhook",
    },
    dashboard: {
      rows: [
        { name: "Lead Follow-up Agent", status: "running", color: "bg-green-500" },
        { name: "Sales Pipeline Agent", status: "completed", color: "bg-blue-500" },
        { name: "Weekly Report", status: "scheduled", color: "bg-muted-foreground/40" },
      ],
      runs: 47,
    },
  },
  {
    prompt:
      "When a support email arrives, categorize by urgency, create a Notion ticket, and ping the on-call team",
    agent: {
      name: "Ticket Triage",
      username: "ticket-triage",
      integrations: ["google_gmail", "notion", "slack"],
      trigger: "Email",
    },
    dashboard: {
      rows: [
        { name: "Ticket Triage", status: "running", color: "bg-green-500" },
        { name: "Escalation Bot", status: "completed", color: "bg-blue-500" },
        { name: "CSAT Survey", status: "scheduled", color: "bg-muted-foreground/40" },
      ],
      runs: 132,
    },
  },
  {
    prompt:
      "Every Monday, pull campaign metrics from HubSpot and Google Sheets, then post a summary digest to Slack",
    agent: {
      name: "Campaign Digest",
      username: "campaign-digest",
      integrations: ["hubspot", "google_sheets", "slack"],
      trigger: "Scheduled",
    },
    dashboard: {
      rows: [
        { name: "Campaign Digest", status: "running", color: "bg-green-500" },
        { name: "Social Monitor", status: "completed", color: "bg-blue-500" },
        { name: "Content Sync", status: "scheduled", color: "bg-muted-foreground/40" },
      ],
      runs: 24,
    },
  },
];

const TYPING_SPEED_MS = 35;
const HOLD_AFTER_COMPLETE_MS = 1200;

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 1: TYPING PROMPT
   ═══════════════════════════════════════════════════════════════════════════════ */

function TypingPrompt({
  prompt,
  onTypingDone,
}: {
  prompt: string;
  onTypingDone: () => void;
}) {
  const [text, setText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const doneRef = useRef(false);

  useEffect(() => {
    setText("");
    setShowCursor(true);
    doneRef.current = false;
    let i = 0;
    const interval = setInterval(() => {
      if (i < prompt.length) {
        setText(prompt.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
        if (!doneRef.current) {
          doneRef.current = true;
          setTimeout(() => setShowCursor(false), 800);
          onTypingDone();
        }
      }
    }, TYPING_SPEED_MS);
    return () => clearInterval(interval);
  }, [prompt, onTypingDone]);

  return (
    <div className="bg-muted/40 border-border/40 min-h-[72px] rounded-lg border px-3 py-2.5">
      <span className="text-foreground text-sm leading-relaxed">
        {text}
        {showCursor && (
          <span className="border-brand ml-0.5 inline-block h-4 w-[2px] animate-[blink-cursor_1s_ease-in-out_infinite] border-l-2" />
        )}
      </span>
      {!text && (
        <span className="text-muted-foreground/50 text-sm">Start typing...</span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 2: BUILDING AGENT
   ═══════════════════════════════════════════════════════════════════════════════ */

function BuildingAgent({
  agent,
  started,
}: {
  agent: Example["agent"];
  started: boolean;
}) {
  const [visibleBadges, setVisibleBadges] = useState(0);
  const [isOn, setIsOn] = useState(false);

  useEffect(() => {
    setVisibleBadges(0);
    setIsOn(false);
    if (!started) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    agent.integrations.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleBadges(i + 1), 350 * (i + 1)));
    });
    timers.push(
      setTimeout(() => setIsOn(true), 350 * (agent.integrations.length + 1)),
    );
    return () => timers.forEach(clearTimeout);
  }, [started, agent]);

  return (
    <>
      {/* Mini card */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <CoworkerAvatar
            username={agent.username}
            size={28}
            className="shrink-0 rounded-full"
          />
          <div className="min-w-0">
            <p className="text-xs leading-tight font-medium">{agent.name}</p>
            <p className="text-muted-foreground text-[10px]">@{agent.username}</p>
          </div>
        </div>
        <motion.div
          animate={{
            backgroundColor: isOn
              ? "oklch(0.72 0.17 142 / 0.1)"
              : "oklch(0 0 0 / 0.04)",
            borderColor: isOn
              ? "oklch(0.72 0.17 142 / 0.2)"
              : "oklch(0 0 0 / 0.1)",
          }}
          transition={{ duration: 0.3 }}
          className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-medium"
        >
          <motion.span
            animate={{
              backgroundColor: isOn
                ? "oklch(0.72 0.17 142)"
                : "oklch(0 0 0 / 0.2)",
            }}
            transition={{ duration: 0.3 }}
            className="size-1.5 rounded-full"
          />
          <span
            className={
              isOn
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground"
            }
          >
            {isOn ? "On" : "Off"}
          </span>
        </motion.div>
      </div>

      {/* Integration badges */}
      <div className="flex items-center gap-1.5">
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
          {agent.trigger}
        </span>
        {agent.integrations.map((key, i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, scale: 0, x: -10 }}
            animate={
              i < visibleBadges
                ? { opacity: 1, scale: 1, x: 0 }
                : { opacity: 0, scale: 0, x: -10 }
            }
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <Image
              src={INTEGRATION_LOGOS[key]}
              alt=""
              width={14}
              height={14}
              className="h-3.5 w-auto"
            />
          </motion.div>
        ))}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   STEP 3: DEPLOY DASHBOARD
   ═══════════════════════════════════════════════════════════════════════════════ */

function AnimatedCounter({
  target,
  started,
}: {
  target: number;
  started: boolean;
}) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    motionValue.set(0);
    setDisplay(0);
    if (!started) return;
    const controls = animate(motionValue, target, {
      duration: 1.2,
      ease: "easeOut",
    });
    return () => controls.stop();
  }, [started, target, motionValue]);

  useEffect(() => {
    return rounded.on("change", (v) => setDisplay(v));
  }, [rounded]);

  return <span>{display}</span>;
}

function DeployDashboard({
  dashboard,
  started,
}: {
  dashboard: Example["dashboard"];
  started: boolean;
}) {
  const [visibleRows, setVisibleRows] = useState(0);

  useEffect(() => {
    setVisibleRows(0);
    if (!started) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    dashboard.rows.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleRows(i + 1), 200 * (i + 1)));
    });
    return () => timers.forEach(clearTimeout);
  }, [started, dashboard]);

  return (
    <>
      {/* Counter */}
      <div className="flex items-baseline gap-2">
        <span className="text-foreground text-2xl font-semibold tabular-nums">
          <AnimatedCounter target={dashboard.runs} started={started} />
        </span>
        <span className="text-muted-foreground text-xs">runs this week</span>
      </div>

      {/* Status rows */}
      <div className="space-y-1.5">
        {dashboard.rows.map((row, i) => (
          <motion.div
            key={row.name}
            initial={{ opacity: 0, x: -10 }}
            animate={
              i < visibleRows
                ? { opacity: 1, x: 0 }
                : { opacity: 0, x: -10 }
            }
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 text-xs"
          >
            <span className={`size-1.5 shrink-0 rounded-full ${row.color}`} />
            <span className="text-foreground truncate">{row.name}</span>
            <span className="text-muted-foreground ml-auto shrink-0 capitalize">
              {row.status === "running" && (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Loader2 className="size-2.5 animate-spin" />
                  Running
                </span>
              )}
              {row.status === "completed" && (
                <span className="flex items-center gap-1">
                  <Check className="size-2.5 text-green-500" />
                  2m ago
                </span>
              )}
              {row.status === "scheduled" && "9:00 AM"}
            </span>
          </motion.div>
        ))}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CONNECTOR LINE
   ═══════════════════════════════════════════════════════════════════════════════ */

function FlowingConnector({ active }: { active: boolean }) {
  return (
    <div className="hidden items-center justify-center md:flex md:px-3 md:py-0 md:pt-16">
      <motion.div
        className="bg-border/60 h-px w-8"
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   EXAMPLE INDICATOR DOTS
   ═══════════════════════════════════════════════════════════════════════════════ */

function ExampleDots({
  count,
  active,
}: {
  count: number;
  active: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            width: i === active ? 24 : 6,
            opacity: i === active ? 1 : 0.3,
          }}
          transition={{ duration: 0.3 }}
          className="bg-brand h-1.5 rounded-full"
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ORCHESTRATOR — cycles examples
   ═══════════════════════════════════════════════════════════════════════════════ */

function useExampleCycle(isInView: boolean) {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [phase, setPhase] = useState<"typing" | "building" | "deploying" | "hold">("typing");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const example = EXAMPLES[exampleIndex]!;

  const onTypingDone = useCallback(() => {
    timerRef.current = setTimeout(() => setPhase("building"), 300);
  }, []);

  // Phase transitions
  useEffect(() => {
    if (!isInView) return;

    if (phase === "building") {
      const buildTime = 350 * (example.agent.integrations.length + 2);
      timerRef.current = setTimeout(() => setPhase("deploying"), buildTime);
    } else if (phase === "deploying") {
      timerRef.current = setTimeout(() => setPhase("hold"), 900);
    } else if (phase === "hold") {
      timerRef.current = setTimeout(() => {
        setExampleIndex((prev) => (prev + 1) % EXAMPLES.length);
        setPhase("typing");
      }, HOLD_AFTER_COMPLETE_MS);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, isInView, example]);

  // Reset on example change
  useEffect(() => {
    setPhase("typing");
  }, [exampleIndex]);

  return {
    example,
    exampleIndex,
    phase,
    onTypingDone,
    step2Started: phase === "building" || phase === "deploying" || phase === "hold",
    step3Started: phase === "deploying" || phase === "hold",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SECTION
   ═══════════════════════════════════════════════════════════════════════════════ */

export function AnimatedHowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: false, margin: "-100px" });

  const {
    example,
    exampleIndex,
    onTypingDone,
    step2Started,
    step3Started,
  } = useExampleCycle(isInView);

  return (
    <section
      ref={sectionRef}
      className="border-border/40 bg-muted/30 border-t px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <p className="text-brand mb-2 text-xs font-semibold tracking-[0.2em] uppercase">
            How it works
          </p>
          <h2 className="text-foreground max-w-xl text-4xl font-semibold tracking-tight md:text-5xl">
            From idea to production in minutes
          </h2>
          <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
            Describe what you need. CmdClaw builds it, secures it, and deploys it.
          </p>
        </motion.div>

        {/* 3-step pipeline */}
        <div className="flex flex-col items-stretch gap-3 md:flex-row md:gap-0 md:items-start">
          {/* Step 1: Describe */}
          <div className="flex-1">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="bg-brand/10 text-brand flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                1
              </span>
              <span className="text-foreground text-sm font-semibold">Describe</span>
            </div>
            <div className="border-border/80 bg-background rounded-2xl border p-5 shadow-sm">
              <div className="text-muted-foreground mb-3 text-[10px] font-medium tracking-wider uppercase">
                Describe your agent
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={exampleIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  <TypingPrompt
                    prompt={example.prompt}
                    onTypingDone={onTypingDone}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <FlowingConnector active={step2Started} />

          {/* Step 2: Configure */}
          <div className="flex-1">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="bg-brand/10 text-brand flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                2
              </span>
              <span className="text-foreground text-sm font-semibold">Configure</span>
            </div>
            <div className="border-border/80 bg-background space-y-3 rounded-2xl border p-5 shadow-sm">
              <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
                Configure & approve
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={exampleIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-3"
                >
                  <BuildingAgent
                    agent={example.agent}
                    started={step2Started}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <FlowingConnector active={step3Started} />

          {/* Step 3: Deploy */}
          <div className="flex-1">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="bg-brand/10 text-brand flex size-8 items-center justify-center rounded-lg text-sm font-bold">
                3
              </span>
              <span className="text-foreground text-sm font-semibold">Deploy</span>
            </div>
            <div className="border-border/80 bg-background space-y-3 rounded-2xl border p-5 shadow-sm">
              <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
                Deploy to your team
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={exampleIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-3"
                >
                  <DeployDashboard
                    dashboard={example.dashboard}
                    started={step3Started}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Example indicator dots */}
        <div className="mt-8">
          <ExampleDots count={EXAMPLES.length} active={exampleIndex} />
        </div>
      </div>
    </section>
  );
}
