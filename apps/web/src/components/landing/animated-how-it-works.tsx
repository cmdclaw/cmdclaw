"use client";

import { motion, useInView, useMotionValue, useTransform, animate } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { CoworkerAvatar } from "@/components/coworker-avatar";
import { INTEGRATION_LOGOS, type IntegrationType } from "@/lib/integration-icons";

/* ── Step 1: Auto-typing prompt ── */

const TYPING_PROMPT = "When a lead replies on HubSpot, draft a follow-up email and alert the team on Slack";
const TYPING_SPEED_MS = 45;

function TypingPrompt({ started }: { started: boolean }) {
  const [text, setText] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const interval = setInterval(() => {
      if (i < TYPING_PROMPT.length) {
        setText(TYPING_PROMPT.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
        // Blink cursor then hide
        setTimeout(() => setShowCursor(false), 1500);
      }
    }, TYPING_SPEED_MS);
    return () => clearInterval(interval);
  }, [started]);

  return (
    <div className="border-border/60 bg-background rounded-xl border p-4 shadow-sm">
      <div className="text-muted-foreground mb-3 text-[10px] font-medium tracking-wider uppercase">
        Describe your agent
      </div>
      <div className="bg-muted/40 border-border/40 min-h-[60px] rounded-lg border px-3 py-2">
        <span className="text-foreground text-sm">
          {text}
          {showCursor && started && (
            <span className="border-brand ml-0.5 inline-block h-4 w-[2px] animate-[blink-cursor_1s_ease-in-out_infinite] border-l-2" />
          )}
        </span>
        {!started && (
          <span className="text-muted-foreground/50 text-sm">Start typing...</span>
        )}
      </div>
    </div>
  );
}

/* ── Step 2: Building the agent ── */

const STEP2_INTEGRATIONS: IntegrationType[] = ["hubspot", "google_gmail", "slack"];

function BuildingAgent({ started }: { started: boolean }) {
  const [visibleBadges, setVisibleBadges] = useState<number>(0);
  const [isOn, setIsOn] = useState(false);

  useEffect(() => {
    if (!started) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEP2_INTEGRATIONS.forEach((_, i) => {
      timers.push(
        setTimeout(() => setVisibleBadges(i + 1), 400 * (i + 1))
      );
    });
    // Toggle on after all badges
    timers.push(
      setTimeout(() => setIsOn(true), 400 * (STEP2_INTEGRATIONS.length + 1))
    );
    return () => timers.forEach(clearTimeout);
  }, [started]);

  return (
    <div className="border-border/60 bg-background space-y-3 rounded-xl border p-4 shadow-sm">
      <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
        Configure & approve
      </div>
      {/* Mini card */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <CoworkerAvatar username="lead-followup" size={28} className="shrink-0 rounded-full" />
          <div className="min-w-0">
            <p className="text-xs font-medium leading-tight">Lead Follow-up Agent</p>
            <p className="text-muted-foreground text-[10px]">@lead-followup</p>
          </div>
        </div>
        <motion.div
          animate={{
            backgroundColor: isOn ? "oklch(0.72 0.17 142 / 0.1)" : "oklch(0 0 0 / 0.04)",
            borderColor: isOn ? "oklch(0.72 0.17 142 / 0.2)" : "oklch(0 0 0 / 0.1)",
          }}
          transition={{ duration: 0.3 }}
          className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-medium"
        >
          <motion.span
            animate={{
              backgroundColor: isOn ? "oklch(0.72 0.17 142)" : "oklch(0 0 0 / 0.2)",
            }}
            transition={{ duration: 0.3 }}
            className="size-1.5 rounded-full"
          />
          <span className={isOn ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
            {isOn ? "On" : "Off"}
          </span>
        </motion.div>
      </div>

      {/* Integration badges animating in */}
      <div className="flex items-center gap-1.5">
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
          Webhook
        </span>
        {STEP2_INTEGRATIONS.map((key, i) => (
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
    </div>
  );
}

/* ── Step 3: Deploy dashboard ── */

const DASHBOARD_ROWS = [
  { name: "Sales Pipeline Agent", status: "running" as const, color: "bg-green-500" },
  { name: "Lead Follow-up Agent", status: "completed" as const, color: "bg-blue-500" },
  { name: "Weekly Report", status: "scheduled" as const, color: "bg-muted-foreground/40" },
];

function AnimatedCounter({ target, started }: { target: number; started: boolean }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
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

function DeployDashboard({ started }: { started: boolean }) {
  const [visibleRows, setVisibleRows] = useState(0);

  useEffect(() => {
    if (!started) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    DASHBOARD_ROWS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleRows(i + 1), 200 * (i + 1)));
    });
    return () => timers.forEach(clearTimeout);
  }, [started]);

  return (
    <div className="border-border/60 bg-background space-y-3 rounded-xl border p-4 shadow-sm">
      <div className="text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
        Deploy to your team
      </div>

      {/* Counter */}
      <div className="flex items-baseline gap-2">
        <span className="text-foreground text-2xl font-semibold tabular-nums">
          <AnimatedCounter target={47} started={started} />
        </span>
        <span className="text-muted-foreground text-xs">runs this week</span>
      </div>

      {/* Status rows */}
      <div className="space-y-1.5">
        {DASHBOARD_ROWS.map((row, i) => (
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
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Running
                </span>
              )}
              {row.status === "completed" && (
                <span className="flex items-center gap-1">
                  <Check className="h-2.5 w-2.5 text-green-500" />
                  2m ago
                </span>
              )}
              {row.status === "scheduled" && "9:00 AM"}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ── Connecting line ── */

function FlowingConnector({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center py-4 md:py-0 md:px-3 md:pt-16">
      <motion.div
        className="bg-border/60 h-8 w-px md:h-px md:w-8"
        initial={{ opacity: 0 }}
        animate={active ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}

/* ── Section ── */

export function AnimatedHowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  const [step1Started, setStep1Started] = useState(false);
  const [step2Started, setStep2Started] = useState(false);
  const [step3Started, setStep3Started] = useState(false);

  useEffect(() => {
    if (!isInView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStep1Started(true), 300));
    timers.push(setTimeout(() => setStep2Started(true), TYPING_PROMPT.length * TYPING_SPEED_MS + 800));
    timers.push(setTimeout(() => setStep3Started(true), TYPING_PROMPT.length * TYPING_SPEED_MS + 2400));
    return () => timers.forEach(clearTimeout);
  }, [isInView]);

  return (
    <section
      ref={sectionRef}
      className="border-border/60 bg-muted/40 border-t px-6 py-20 md:py-28"
    >
      <div className="mx-auto max-w-[1500px]">
        <p className="text-brand mb-2 text-center text-sm font-semibold tracking-wider uppercase">
          How it works
        </p>
        <h2 className="text-foreground mb-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
          From idea to production in minutes
        </h2>
        <p className="text-muted-foreground mx-auto mb-16 max-w-2xl text-center text-base">
          Describe what you need. CmdClaw builds it, secures it, and deploys it.
        </p>

        {/* 3-step pipeline */}
        <div className="mx-auto flex max-w-4xl flex-col items-stretch md:flex-row md:items-start">
          {/* Step 1 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4 }}
            className="flex-1"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="bg-brand/10 text-brand flex size-7 items-center justify-center rounded-lg text-xs font-bold">
                1
              </span>
              <span className="text-foreground text-sm font-semibold">Describe</span>
            </div>
            <TypingPrompt started={step1Started} />
          </motion.div>

          <FlowingConnector active={step2Started} />

          {/* Step 2 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={step2Started ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4 }}
            className="flex-1"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="bg-brand/10 text-brand flex size-7 items-center justify-center rounded-lg text-xs font-bold">
                2
              </span>
              <span className="text-foreground text-sm font-semibold">Configure</span>
            </div>
            <BuildingAgent started={step2Started} />
          </motion.div>

          <FlowingConnector active={step3Started} />

          {/* Step 3 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={step3Started ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4 }}
            className="flex-1"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="bg-brand/10 text-brand flex size-7 items-center justify-center rounded-lg text-xs font-bold">
                3
              </span>
              <span className="text-foreground text-sm font-semibold">Deploy</span>
            </div>
            <DeployDashboard started={step3Started} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
