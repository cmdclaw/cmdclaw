"use client";

import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import { Check, Loader2, Activity, Timer } from "lucide-react";
import { CoworkerAvatar } from "@/components/coworker-avatar";
import { INTEGRATION_LOGOS, type IntegrationType } from "@/lib/integration-icons";

/* ── Demo data ── */

type DemoItem = {
  id: string;
  integration: IntegrationType;
  label: string;
};

const DEMO_ITEMS: DemoItem[] = [
  { id: "1", integration: "hubspot", label: "Listing deals" },
  { id: "2", integration: "hubspot", label: "Getting deal → Acme Corp" },
  { id: "3", integration: "hubspot", label: "Listing contacts" },
  { id: "4", integration: "google_gmail", label: "Listing emails" },
  { id: "5", integration: "google_gmail", label: "Reading email → Re: Q2 proposal" },
  { id: "6", integration: "slack", label: "Searching messages → #sales-pipeline" },
  { id: "7", integration: "hubspot", label: "Updating deal → Acme Corp" },
  { id: "8", integration: "slack", label: "Sending message → #sales-alerts" },
  { id: "9", integration: "google_gmail", label: "Sending email → Follow-up: Acme Corp" },
  { id: "10", integration: "hubspot", label: "Creating task → Call with James" },
  { id: "11", integration: "salesforce", label: "Updating contact → James Miller" },
  { id: "12", integration: "slack", label: "Sending message → @sarah" },
];

const COWORKER_DATA = {
  name: "Sales Pipeline Agent",
  username: "sales-pipeline",
  description: "Monitors HubSpot deals, drafts follow-ups, and keeps the team updated in Slack.",
  integrations: ["hubspot", "google_gmail", "slack", "salesforce"] as IntegrationType[],
};

const INTERVAL_MS = 2200;
const PAUSE_MS = 3000;

/* ── Activity item (lightweight clone) ── */

function DemoActivityItem({
  item,
  isLatest,
}: {
  item: DemoItem;
  isLatest: boolean;
}) {
  const logo = INTEGRATION_LOGOS[item.integration];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-1.5 py-0.5 text-xs"
    >
      <Image
        src={logo}
        alt=""
        width={14}
        height={14}
        className="h-3.5 w-auto shrink-0"
      />
      <span className="text-foreground font-mono">{item.label}</span>
      <div className="flex-1" />
      {isLatest ? (
        <Loader2 className="text-muted-foreground h-3 w-3 shrink-0 animate-spin" />
      ) : (
        <Check className="h-3 w-3 shrink-0 text-green-500" />
      )}
    </motion.div>
  );
}

/* ── Demo Activity Feed ── */

function DemoFeed() {
  const [visibleItems, setVisibleItems] = useState<DemoItem[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const startTimeRef = useRef(Date.now());

  // Auto-play items
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function next() {
      const idx = indexRef.current;
      if (idx < DEMO_ITEMS.length) {
        const item = DEMO_ITEMS[idx]!;
        indexRef.current = idx + 1;
        setVisibleItems((prev) => [...prev, item]);
        timer = setTimeout(next, INTERVAL_MS);
      } else {
        // Pause then reset
        timer = setTimeout(() => {
          indexRef.current = 0;
          startTimeRef.current = Date.now();
          setVisibleItems([]);
          timer = setTimeout(next, 600);
        }, PAUSE_MS);
      }
    }

    timer = setTimeout(next, 800);
    return () => clearTimeout(timer);
  }, []);

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleItems]);

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className="border-border/50 bg-muted/30 overflow-hidden rounded-lg border">
      {/* Header */}
      <div className="border-border/30 flex items-center gap-2 border-b px-3 py-2 text-sm">
        <Activity className="text-muted-foreground h-4 w-4" />
        <span className="text-muted-foreground text-xs font-medium">Activity</span>
        <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium">
          {visibleItems.length}
        </span>
        <div className="flex-1" />
        <div className="text-muted-foreground flex items-center gap-1 text-[10px]">
          <Timer className="h-3 w-3" />
          {formatElapsed(elapsed)}
        </div>
      </div>

      {/* Items */}
      <div
        ref={scrollRef}
        className="overflow-y-auto px-3 py-2"
        style={{ maxHeight: 220 }}
      >
        <AnimatePresence initial={false}>
          {visibleItems.map((item, i) => (
            <DemoActivityItem
              key={`${item.id}-${Math.floor(i / DEMO_ITEMS.length)}`}
              item={item}
              isLatest={i === visibleItems.length - 1}
            />
          ))}
        </AnimatePresence>
        {visibleItems.length === 0 && (
          <div className="flex items-center gap-2 py-2">
            <span className="text-muted-foreground text-xs">Starting agent...</span>
            <div className="ml-auto flex gap-1">
              <span className="bg-muted-foreground/50 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
              <span className="bg-muted-foreground/50 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
              <span className="bg-muted-foreground/50 h-1.5 w-1.5 animate-bounce rounded-full" />
            </div>
          </div>
        )}
      </div>

      {/* Integration badges footer */}
      <div className="border-border/30 flex items-center gap-1.5 border-t px-3 py-1.5">
        {COWORKER_DATA.integrations.map((key) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <Image
              src={INTEGRATION_LOGOS[key]}
              alt=""
              width={16}
              height={16}
              className="h-4 w-auto"
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ── Coworker Card (lightweight) ── */

function DemoCoworkerCard() {
  return (
    <div className="border-border/60 bg-background space-y-3 rounded-xl border p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <CoworkerAvatar username={COWORKER_DATA.username} size={36} className="shrink-0 rounded-full" />
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm leading-tight font-medium">{COWORKER_DATA.name}</p>
            <p className="text-muted-foreground bg-muted/60 inline-flex rounded-full px-2 py-0.5 font-mono text-[10px]">
              @{COWORKER_DATA.username}
            </p>
          </div>
        </div>
        <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 text-xs font-medium text-green-600 dark:text-green-400">
          <span className="size-2 animate-pulse rounded-full bg-green-500" />
          On
        </div>
      </div>

      {/* Description */}
      <p className="text-muted-foreground text-xs leading-relaxed">
        {COWORKER_DATA.description}
      </p>

      {/* Badges */}
      <div className="flex items-center gap-2">
        <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium">
          Scheduled
        </span>
        <span className="text-foreground/70 bg-foreground/[0.06] inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
          Shared
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {COWORKER_DATA.integrations.map((key) => (
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

      {/* Running status */}
      <div className="text-xs flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin text-brand" />
        <span className="text-brand font-medium">Running now...</span>
      </div>
    </div>
  );
}

/* ── Section ── */

export function LiveAgentDemoSection() {
  return (
    <section className="bg-background border-border/60 border-t px-6 py-20 md:py-28">
      <div className="mx-auto max-w-[1500px]">
        <p className="text-brand mb-2 text-center text-sm font-semibold tracking-wider uppercase">
          See it in action
        </p>
        <h2 className="text-foreground mb-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Watch your agent work in real time
        </h2>
        <p className="text-muted-foreground mx-auto mb-16 max-w-2xl text-center text-base">
          Your coworker connects to your tools and executes tasks autonomously — you just watch the activity feed.
        </p>

        <div className="mx-auto grid max-w-4xl grid-cols-1 items-start gap-8 md:grid-cols-[2fr_3fr]">
          {/* Left: Coworker card */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <DemoCoworkerCard />
          </motion.div>

          {/* Right: Activity feed */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          >
            <DemoFeed />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
