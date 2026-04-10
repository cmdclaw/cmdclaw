"use client";

import { motion, useMotionValue, useSpring, AnimatePresence } from "motion/react";
import Image from "next/image";
import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  INTEGRATION_LOGOS,
  INTEGRATION_DISPLAY_NAMES,
  type IntegrationType,
} from "@/lib/integration-icons";

/* ── Config ── */

type IntegrationNode = {
  key: IntegrationType;
  action: string;
};

const NODES: IntegrationNode[] = [
  { key: "google_gmail", action: "Send & read emails" },
  { key: "slack", action: "Send messages to channels" },
  { key: "hubspot", action: "Manage deals & contacts" },
  { key: "salesforce", action: "Query & update records" },
  { key: "notion", action: "Create & search pages" },
  { key: "linear", action: "Create & manage issues" },
  { key: "github", action: "List PRs & search code" },
  { key: "google_calendar", action: "Create & list events" },
  { key: "google_sheets", action: "Read & update cells" },
  { key: "google_drive", action: "Search & download files" },
  { key: "airtable", action: "Query & create records" },
  { key: "linkedin", action: "Send messages & post" },
  { key: "outlook", action: "Read & send emails" },
  { key: "google_docs", action: "Read & create documents" },
  { key: "dynamics", action: "Manage CRM records" },
  { key: "outlook_calendar", action: "Schedule meetings" },
];

// Drift animation configs — each node gets unique timing
const DRIFT_CONFIGS = NODES.map((_, i) => ({
  duration: 8 + (i % 5) * 1.5,
  delay: (i * 0.7) % 4,
  xRange: 4 + (i % 3) * 2,
  yRange: 3 + (i % 4) * 1.5,
}));

/* ── Floating node ── */

function FloatingNode({
  node,
  index,
  isHovered,
  onHover,
  onLeave,
}: {
  node: IntegrationNode;
  index: number;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const drift = DRIFT_CONFIGS[index]!;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="relative"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <motion.div
        animate={{
          x: [0, drift.xRange, -drift.xRange * 0.6, 0],
          y: [0, -drift.yRange, drift.yRange * 0.8, 0],
        }}
        transition={{
          duration: drift.duration,
          delay: drift.delay,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ willChange: "transform" }}
      >
        <motion.div
          whileHover={{ scale: 1.2 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="border-border/60 bg-background relative flex size-14 cursor-pointer items-center justify-center rounded-2xl border shadow-sm transition-shadow"
          style={{
            boxShadow: isHovered
              ? "0 0 24px oklch(0.50 0.14 25 / 0.2), 0 4px 12px oklch(0 0 0 / 0.08)"
              : "0 1px 3px oklch(0 0 0 / 0.05)",
          }}
        >
          <Image
            src={INTEGRATION_LOGOS[node.key]}
            alt={INTEGRATION_DISPLAY_NAMES[node.key]}
            width={28}
            height={28}
            className="h-7 w-auto"
          />
        </motion.div>

        {/* Tooltip */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 whitespace-nowrap"
            >
              <div className="bg-foreground text-background rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg">
                <div>{INTEGRATION_DISPLAY_NAMES[node.key]}</div>
                <div className="text-background/70 text-[10px] font-normal">{node.action}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/* ── SVG Connection Lines ── */

function ConnectionLines({
  hoveredIndex,
  containerRef,
}: {
  hoveredIndex: number | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  useEffect(() => {
    if (hoveredIndex === null || !containerRef.current) {
      setLines([]);
      return;
    }

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const nodes = container.querySelectorAll<HTMLElement>("[data-integration-node]");
    const hoveredNode = nodes[hoveredIndex];
    if (!hoveredNode) return;

    const hoveredRect = hoveredNode.getBoundingClientRect();
    const hx = hoveredRect.left + hoveredRect.width / 2 - containerRect.left;
    const hy = hoveredRect.top + hoveredRect.height / 2 - containerRect.top;

    // Connect to 2-3 nearest neighbors
    const distances = Array.from(nodes)
      .map((node, i) => {
        if (i === hoveredIndex) return null;
        const rect = node.getBoundingClientRect();
        const nx = rect.left + rect.width / 2 - containerRect.left;
        const ny = rect.top + rect.height / 2 - containerRect.top;
        const dist = Math.sqrt((nx - hx) ** 2 + (ny - hy) ** 2);
        return { i, x: nx, y: ny, dist };
      })
      .filter(Boolean)
      .sort((a, b) => a!.dist - b!.dist)
      .slice(0, 3);

    setLines(
      distances.map((d) => ({
        x1: hx,
        y1: hy,
        x2: d!.x,
        y2: d!.y,
      })),
    );
  }, [hoveredIndex, containerRef]);

  if (lines.length === 0) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible">
      {lines.map((line, i) => (
        <motion.line
          key={i}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="oklch(0.50 0.14 25 / 0.25)"
          strokeWidth={1.5}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          exit={{ pathLength: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      ))}
    </svg>
  );
}

/* ── Mobile grid ── */

function MobileGrid() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {NODES.map((node, i) => (
        <motion.div
          key={node.key}
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.2, delay: i * 0.04 }}
          className="flex flex-col items-center gap-1.5"
        >
          <div className="border-border/60 bg-background flex size-12 items-center justify-center rounded-xl border shadow-sm">
            <Image
              src={INTEGRATION_LOGOS[node.key]}
              alt={INTEGRATION_DISPLAY_NAMES[node.key]}
              width={24}
              height={24}
              className="h-6 w-auto"
            />
          </div>
          <span className="text-muted-foreground text-[10px] font-medium">
            {INTEGRATION_DISPLAY_NAMES[node.key]}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

/* ── Section ── */

export function IntegrationNetworkSection() {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <section className="bg-background border-border/60 border-t px-6 py-20 md:py-28">
      <div className="mx-auto max-w-[1500px]">
        <p className="text-brand mb-2 text-center text-sm font-semibold tracking-wider uppercase">
          Integrations
        </p>
        <h2 className="text-foreground mb-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Connected to every tool your team uses
        </h2>
        <p className="text-muted-foreground mx-auto mb-16 max-w-2xl text-center text-base">
          One-click OAuth. Shared across your workspace. No API keys to manage.
        </p>

        {isMobile ? (
          <MobileGrid />
        ) : (
          <div ref={containerRef} className="relative mx-auto max-w-3xl">
            <ConnectionLines hoveredIndex={hoveredIndex} containerRef={containerRef} />
            <div className="relative z-10 flex flex-wrap items-center justify-center gap-5">
              {NODES.map((node, i) => (
                <div key={node.key} data-integration-node>
                  <FloatingNode
                    node={node}
                    index={i}
                    isHovered={hoveredIndex === i}
                    onHover={() => setHoveredIndex(i)}
                    onLeave={() => setHoveredIndex(null)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
