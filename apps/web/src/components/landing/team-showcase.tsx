"use client";

import {
  Check,
  Loader2,
  ShieldCheck,
  KeyRound,
  Inbox,
} from "lucide-react";
import { motion, AnimatePresence, useInView } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";
import { CoworkerAvatar } from "@/components/coworker-avatar";
import { CursorProvider, Cursor, CursorFollow } from "@/components/ui/cursor";
import { INTEGRATION_LOGOS, type IntegrationType } from "@/lib/integration-icons";

/* ═══════════════════════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════════════════════ */

type ShowcaseAgent = {
  name: string;
  username: string;
  description: string;
  trigger: string;
  integrations: IntegrationType[];
};

const AGENTS: ShowcaseAgent[] = [
  {
    name: "Lead Qualifier",
    username: "lead-qualifier",
    description: "Scores incoming leads from HubSpot and routes hot leads",
    trigger: "On new lead",
    integrations: ["hubspot", "salesforce", "slack"],
  },
  {
    name: "Ticket Triage",
    username: "ticket-triage",
    description: "Reads support emails, creates tickets in Notion",
    trigger: "Email",
    integrations: ["google_gmail", "notion", "slack"],
  },
  {
    name: "Deal Closer",
    username: "deal-closer",
    description: "Drafts follow-up emails for stale pipeline deals",
    trigger: "Scheduled",
    integrations: ["salesforce", "google_gmail", "slack"],
  },
  {
    name: "Social Monitor",
    username: "social-monitor",
    description: "Tracks LinkedIn mentions and competitor posts",
    trigger: "Scheduled",
    integrations: ["linkedin", "slack"],
  },
];

/* ── Inbox timeline: ordered sequence of events ── */

type InboxItemStatus = "awaiting_approval" | "awaiting_auth" | "completed" | "running";

type CursorUser = {
  name: string;
  color: string;
};

const CURSOR_USERS: CursorUser[] = [
  { name: "Sarah", color: "#3B82F6" },
  { name: "James", color: "#10B981" },
  { name: "Priya", color: "#F59E0B" },
  { name: "Alex", color: "#8B5CF6" },
];

type DismissAction = "approve" | "deny" | "connect";

type TimelineEvent =
  | { type: "add"; item: InboxItemData }
  | { type: "dismiss"; itemId: string; user: CursorUser; action: DismissAction }
  | { type: "pulse"; agentIndex: number }
  | { type: "pause" };

type InboxItemData = {
  id: string;
  agentUsername: string;
  title: string;
  status: InboxItemStatus;
  integration: IntegrationType;
};

// Scripted sequence that loops
const TIMELINE: TimelineEvent[] = [
  // Initial burst — agents light up and add items
  { type: "pulse", agentIndex: 0 },
  {
    type: "add",
    item: {
      id: "a",
      agentUsername: "lead-qualifier",
      title: "Send email → james@acme.com",
      status: "awaiting_approval",
      integration: "google_gmail",
    },
  },
  { type: "pulse", agentIndex: 1 },
  {
    type: "add",
    item: {
      id: "b",
      agentUsername: "ticket-triage",
      title: "Create page → Ticket #413",
      status: "awaiting_approval",
      integration: "notion",
    },
  },
  { type: "pulse", agentIndex: 2 },
  {
    type: "add",
    item: {
      id: "c",
      agentUsername: "deal-closer",
      title: "Connect Salesforce",
      status: "awaiting_auth",
      integration: "salesforce",
    },
  },
  { type: "pause" },
  { type: "dismiss", itemId: "a", user: CURSOR_USERS[0]!, action: "approve" },
  { type: "pulse", agentIndex: 0 },
  {
    type: "add",
    item: {
      id: "d",
      agentUsername: "lead-qualifier",
      title: "Update deal score → Acme Corp",
      status: "completed",
      integration: "hubspot",
    },
  },
  { type: "dismiss", itemId: "b", user: CURSOR_USERS[1]!, action: "approve" },
  { type: "pulse", agentIndex: 3 },
  {
    type: "add",
    item: {
      id: "e",
      agentUsername: "social-monitor",
      title: "Listed mentions → 6 new",
      status: "running",
      integration: "linkedin",
    },
  },
  { type: "pause" },
  { type: "dismiss", itemId: "c", user: CURSOR_USERS[2]!, action: "connect" },
  { type: "pulse", agentIndex: 1 },
  {
    type: "add",
    item: {
      id: "f",
      agentUsername: "ticket-triage",
      title: "Send message → #support-urgent",
      status: "completed",
      integration: "slack",
    },
  },
  { type: "dismiss", itemId: "d", user: CURSOR_USERS[3]!, action: "deny" },
  { type: "pulse", agentIndex: 2 },
  {
    type: "add",
    item: {
      id: "g",
      agentUsername: "deal-closer",
      title: "Send email → Re: Q2 Renewal",
      status: "awaiting_approval",
      integration: "google_gmail",
    },
  },
  { type: "pause" },
  { type: "dismiss", itemId: "e", user: CURSOR_USERS[0]!, action: "approve" },
  { type: "dismiss", itemId: "f", user: CURSOR_USERS[1]!, action: "approve" },
  { type: "dismiss", itemId: "g", user: CURSOR_USERS[2]!, action: "deny" },
  { type: "pause" },
];

const EVENT_INTERVAL_MS = 900;
const PAUSE_DURATION_MS = 1800;
const RESET_PAUSE_MS = 2500;

const STATUS_META: Record<
  InboxItemStatus,
  { color: string; dotColor: string; label: string; icon: typeof ShieldCheck }
> = {
  awaiting_approval: {
    color: "text-amber-500",
    dotColor: "bg-amber-500",
    label: "Approve",
    icon: ShieldCheck,
  },
  awaiting_auth: {
    color: "text-orange-500",
    dotColor: "bg-orange-500",
    label: "Connect",
    icon: KeyRound,
  },
  completed: {
    color: "text-green-500",
    dotColor: "bg-green-500",
    label: "Done",
    icon: Check,
  },
  running: {
    color: "text-blue-500",
    dotColor: "bg-blue-500",
    label: "Running",
    icon: Loader2,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════════
   AGENT MINI CARD
   ═══════════════════════════════════════════════════════════════════════════════ */

function AgentMiniCard({
  agent,
  isPulsing,
}: {
  agent: ShowcaseAgent;
  isPulsing: boolean;
}) {
  return (
    <div
      className={`border-border/80 bg-background rounded-xl border p-3.5 transition-all duration-500 ${
        isPulsing
          ? "border-brand/40 shadow-[0_0_20px_rgba(59,130,246,0.1)]"
          : ""
      }`}
    >
      <div className="flex items-start gap-2.5">
        <CoworkerAvatar username={agent.username} size={28} className="shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-foreground truncate text-xs font-semibold">{agent.name}</p>
            <div className="ml-auto inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-1.5 text-[9px] font-medium text-green-600 dark:text-green-400">
              <span
                className={`size-1.5 rounded-full bg-green-500 ${isPulsing ? "animate-ping" : "animate-pulse"}`}
              />
              On
            </div>
          </div>
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[10px]">
            {agent.description}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[8px] font-medium">
              {agent.trigger}
            </span>
            <div className="ml-auto flex items-center gap-0.5">
              {agent.integrations.map((key) => (
                <Image
                  key={key}
                  src={INTEGRATION_LOGOS[key]}
                  alt=""
                  width={11}
                  height={11}
                  className="size-[11px]"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   INBOX ROW
   ═══════════════════════════════════════════════════════════════════════════════ */

const ACTION_DISPLAY: Record<DismissAction, { label: string; color: string; dotColor: string }> = {
  approve: { label: "Approved", color: "text-green-600 dark:text-green-400", dotColor: "bg-green-500" },
  deny: { label: "Denied", color: "text-red-500", dotColor: "bg-red-500" },
  connect: { label: "Connected", color: "text-blue-500", dotColor: "bg-blue-500" },
};

// Shared ref map for status button positions
type ButtonPositionMap = Map<string, { x: number; y: number }>;

function InboxRow({
  item,
  isDismissing,
  cursorTarget,
  resolvedAction,
  inboxRef,
  buttonPositions,
}: {
  item: InboxItemData;
  isDismissing: boolean;
  cursorTarget: boolean;
  resolvedAction: DismissAction | null;
  inboxRef: React.RefObject<HTMLDivElement | null>;
  buttonPositions: ButtonPositionMap;
}) {
  const meta = STATUS_META[item.status];
  const StatusIcon = meta.icon;
  const actionDisplay = resolvedAction ? ACTION_DISPLAY[resolvedAction] : null;
  const statusRef = useRef<HTMLDivElement>(null);

  // Measure and register button position relative to inbox container
  useEffect(() => {
    const measure = () => {
      const btn = statusRef.current;
      const container = inboxRef.current;
      if (!btn || !container) return;
      const btnRect = btn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      buttonPositions.set(item.id, {
        x: btnRect.left - containerRect.left + btnRect.width / 2,
        y: btnRect.top - containerRect.top + btnRect.height / 2,
      });
    };
    measure();
    // Re-measure on layout shifts
    const ro = new ResizeObserver(measure);
    if (statusRef.current) ro.observe(statusRef.current);
    return () => {
      ro.disconnect();
      buttonPositions.delete(item.id);
    };
  }, [item.id, inboxRef, buttonPositions]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{
        opacity: isDismissing ? 0 : 1,
        height: isDismissing ? 0 : "auto",
        x: isDismissing ? 30 : 0,
      }}
      exit={{ opacity: 0, height: 0, x: 30 }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
      className="border-border/40 relative overflow-hidden border-b last:border-b-0"
    >
      <div
        className={`flex items-center gap-3 px-4 py-2.5 transition-colors duration-300 ${
          cursorTarget ? "bg-brand/5" : ""
        }`}
      >
        {/* Status dot */}
        <span className="relative flex size-2 shrink-0">
          {!actionDisplay && (item.status === "awaiting_approval" || item.status === "awaiting_auth") && (
            <span
              className={`absolute inset-0 animate-ping rounded-full opacity-40 ${meta.dotColor}`}
            />
          )}
          <span
            className={`relative inline-flex size-2 rounded-full ${actionDisplay ? actionDisplay.dotColor : meta.dotColor}`}
          />
        </span>

        {/* Avatar */}
        <CoworkerAvatar username={item.agentUsername} size={20} className="shrink-0 rounded-full" />

        {/* Content */}
        <div className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-[11px] font-medium">
            {item.title}
          </span>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[9px]">
            <Image
              src={INTEGRATION_LOGOS[item.integration]}
              alt=""
              width={10}
              height={10}
              className="size-2.5"
            />
            <span>@{item.agentUsername}</span>
          </div>
        </div>

        {/* Status — shows resolved action or original status */}
        <div ref={statusRef} className={`flex w-20 shrink-0 items-center justify-end gap-1 text-[9px] font-medium ${actionDisplay ? actionDisplay.color : meta.color}`}>
          <AnimatePresence mode="wait">
            {actionDisplay ? (
              <motion.span
                key="action"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1"
              >
                <Check className="size-3" />
                <span>{actionDisplay.label}</span>
              </motion.span>
            ) : (
              <motion.span
                key="status"
                className="flex items-center gap-1"
              >
                <StatusIcon className={`size-3 ${item.status === "running" ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{meta.label}</span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ANIMATED CURSOR
   ═══════════════════════════════════════════════════════════════════════════════ */

function CursorArrow({ color }: { color: string }) {
  return (
    <svg
      className="size-5"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
    >
      <path
        fill={color}
        d="M1.8 4.4 7 36.2c.3 1.8 2.6 2.3 3.6.8l3.9-5.7c1.7-2.5 4.5-4.1 7.5-4.3l6.9-.5c1.8-.1 2.5-2.4 1.1-3.5L5 2.5c-1.4-1.1-3.5 0-3.3 1.9Z"
      />
    </svg>
  );
}

function NamedCursor({
  visible,
  x,
  y,
  user,
  isClicking,
}: {
  visible: boolean;
  x: number;
  y: number;
  user: CursorUser | null;
  isClicking: boolean;
}) {
  return (
    <motion.div
      animate={{
        opacity: visible ? 1 : 0,
        x,
        y,
        scale: visible ? (isClicking ? 0.85 : 1) : 0.8,
      }}
      transition={{ duration: isClicking ? 0.1 : 0.5, ease: "easeInOut" }}
      className="pointer-events-none absolute z-30"
      style={{ left: 0, top: 0 }}
    >
      <CursorArrow color={user?.color ?? "#6B7280"} />
      {user && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8, x: -4 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          className="absolute top-4 left-3 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg"
          style={{ backgroundColor: user.color }}
        >
          {user.name}
        </motion.span>
      )}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ORCHESTRATOR — runs the timeline loop
   ═══════════════════════════════════════════════════════════════════════════════ */

// Initial items so inbox is never empty on first render
const INITIAL_INBOX_ITEMS: InboxItemData[] = [
  {
    id: "init-1",
    agentUsername: "lead-qualifier",
    title: "Update deal score → Globex Inc",
    status: "completed",
    integration: "hubspot",
  },
  {
    id: "init-2",
    agentUsername: "ticket-triage",
    title: "Send message → #support-triage",
    status: "completed",
    integration: "slack",
  },
];

function useTimelineLoop(isActive: boolean, buttonPositions: ButtonPositionMap) {
  const [items, setItems] = useState<InboxItemData[]>(INITIAL_INBOX_ITEMS);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [cursorTargetId, setCursorTargetId] = useState<string | null>(null);
  const [resolvedActions, setResolvedActions] = useState<Record<string, DismissAction>>({});
  const [pulsingAgent, setPulsingAgent] = useState<number | null>(null);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorClicking, setCursorClicking] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 300, y: 200 });
  const [cursorUser, setCursorUser] = useState<CursorUser | null>(null);
  const stepRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runStep = useCallback(() => {
    const step = stepRef.current;

    if (step >= TIMELINE.length) {
      setCursorVisible(false);
      setCursorTargetId(null);
      setCursorUser(null);
      setPulsingAgent(null);
      timerRef.current = setTimeout(() => {
        setItems(INITIAL_INBOX_ITEMS);
        setDismissingId(null);
        setResolvedActions({});
        stepRef.current = 0;
        timerRef.current = setTimeout(runStep, 800);
      }, RESET_PAUSE_MS);
      return;
    }

    const event = TIMELINE[step]!;
    stepRef.current = step + 1;

    switch (event.type) {
      case "add":
        setPulsingAgent(null);
        setItems((prev) => [event.item, ...prev]);
        timerRef.current = setTimeout(runStep, EVENT_INTERVAL_MS);
        break;

      case "dismiss": {
        const needsCursor = event.action === "approve" || event.action === "connect";

        if (needsCursor) {
          // Full cursor animation: glide → click → status change → slide away
          setCursorVisible(true);
          setCursorClicking(false);
          setCursorUser(event.user);
          const btnPos = buttonPositions.get(event.itemId);
          const itemIdx = items.findIndex((i) => i.id === event.itemId);
          const fallbackY = 44 + 52 * Math.max(0, itemIdx) + 14;
          const targetX = btnPos?.x ?? 300;
          const targetY = btnPos?.y ?? fallbackY;

          // Start cursor offset to the left
          setCursorPos({ x: targetX - 100, y: targetY });

          // Glide to the button
          timerRef.current = setTimeout(() => {
            setCursorTargetId(event.itemId);
            setCursorPos({ x: targetX, y: targetY });

            // Click animation
            timerRef.current = setTimeout(() => {
              setCursorClicking(true);

              // Release click — status changes
              timerRef.current = setTimeout(() => {
                setCursorClicking(false);
                setResolvedActions((prev) => ({ ...prev, [event.itemId]: event.action }));

                // Pause then slide away
                timerRef.current = setTimeout(() => {
                  setDismissingId(event.itemId);
                  timerRef.current = setTimeout(() => {
                    setItems((prev) => prev.filter((i) => i.id !== event.itemId));
                    setDismissingId(null);
                    setCursorTargetId(null);
                    setCursorVisible(false);
                    setCursorUser(null);
                    setResolvedActions((prev) => {
                      const next = { ...prev };
                      delete next[event.itemId];
                      return next;
                    });
                    timerRef.current = setTimeout(runStep, 250);
                  }, 400);
                }, 600);
              }, 120);
            }, 400);
          }, 300);
        } else {
          // No cursor — just silently slide the item away
          setDismissingId(event.itemId);
          timerRef.current = setTimeout(() => {
            setItems((prev) => prev.filter((i) => i.id !== event.itemId));
            setDismissingId(null);
            timerRef.current = setTimeout(runStep, 250);
          }, 400);
        }
        break;
      }

      case "pulse":
        setPulsingAgent(event.agentIndex);
        timerRef.current = setTimeout(() => {
          timerRef.current = setTimeout(runStep, 200);
        }, 400);
        break;

      case "pause":
        setCursorVisible(false);
        setCursorTargetId(null);
        setCursorUser(null);
        timerRef.current = setTimeout(runStep, PAUSE_DURATION_MS);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    if (!isActive) return;
    timerRef.current = setTimeout(runStep, 1200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  useEffect(() => {
    // no-op: just ensures runStep recaptures `items`
  }, [runStep]);

  return { items, dismissingId, cursorTargetId, resolvedActions, pulsingAgent, cursorVisible, cursorClicking, cursorPos, cursorUser };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SECTION
   ═══════════════════════════════════════════════════════════════════════════════ */

export function TeamShowcaseSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const inboxRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: false, margin: "-120px" });
  const buttonPositionsRef = useRef<ButtonPositionMap>(new Map());

  const { items, dismissingId, cursorTargetId, resolvedActions, pulsingAgent, cursorVisible, cursorClicking, cursorPos, cursorUser } =
    useTimelineLoop(isInView, buttonPositionsRef.current);

  const pendingCount = items.filter(
    (i) => i.status === "awaiting_approval" || i.status === "awaiting_auth",
  ).length;

  return (
    <section
      ref={sectionRef}
      className="bg-muted/20 border-border/40 border-t px-6 py-20 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        {/* Header — left-aligned */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-14 md:mb-20"
        >
          <h2 className="text-foreground max-w-md text-3xl font-bold tracking-tight md:text-[2.75rem] md:leading-[1.15]">
            Coworkers that handle the work for you
          </h2>
          <p className="text-muted-foreground mt-4 max-w-lg text-base leading-relaxed">
            Your agents work autonomously and surface what matters to your inbox — approvals, auth requests, and results. You stay in control.
          </p>
        </motion.div>

        {/* Split layout: inbox first on mobile, agents left on desktop */}
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[1fr_1.2fr]">
          {/* Agent cards — order-2 on mobile (below inbox), order-1 on md+ (left) */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="order-2 space-y-2.5 md:order-1"
          >
            {AGENTS.map((agent, i) => (
              <AgentMiniCard key={agent.username} agent={agent} isPulsing={pulsingAgent === i} />
            ))}
          </motion.div>

          {/* Inbox feed — order-1 on mobile (above agents), order-2 on md+ (right) */}
          <motion.div
            ref={inboxRef}
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="border-border/80 bg-background relative order-1 flex flex-col overflow-hidden rounded-2xl border md:order-2"
          >
            {/* Header */}
            <div className="border-border/40 flex items-center gap-2.5 border-b px-4 py-3">
              <Inbox className="text-muted-foreground size-4" />
              <span className="text-foreground text-sm font-semibold">Inbox</span>
              <AnimatePresence>
                {pendingCount > 0 && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-600 dark:text-amber-400"
                  >
                    {pendingCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* Items */}
            <div className="min-h-[280px] overflow-hidden">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <InboxRow
                    key={item.id}
                    item={item}
                    isDismissing={dismissingId === item.id}
                    cursorTarget={cursorTargetId === item.id}
                    resolvedAction={resolvedActions[item.id] ?? null}
                    inboxRef={inboxRef}
                    buttonPositions={buttonPositionsRef.current}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* TODO: re-enable cursors later
            <NamedCursor visible={cursorVisible} x={cursorPos.x} y={cursorPos.y} user={cursorUser} isClicking={cursorClicking} />

            <CursorProvider>
              <Cursor>
                <CursorArrow color="#9B4D3C" />
              </Cursor>
              <CursorFollow>
                <div className="rounded-full bg-[#9B4D3C] px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg">
                  You
                </div>
              </CursorFollow>
            </CursorProvider>
            */}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
