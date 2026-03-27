"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PromptSegment } from "@/lib/prompt-segments";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PromptComposerProps = {
  onSubmit: (text: string) => void;
  isSubmitting?: boolean;
  placeholder?: string;
  animatedPlaceholders?: string[];
  richAnimatedPlaceholders?: PromptSegment[][];
  onAnimatedPlaceholderIndexChange?: (index: number) => void;
  variant?: "hero" | "embedded";
  className?: string;
};

const RICH_PLACEHOLDER_LINE_HEIGHT_STYLE = { lineHeight: "2rem" } as const;
const RICH_PLACEHOLDER_CURSOR_STYLE = {
  animation: "blink-cursor 1s step-end infinite",
} as const;

// ─── Rich Placeholder Overlay ────────────────────────────────────────────────

/**
 * Computes the total character length of a segment array (using brand name length
 * as the character count for brand segments).
 */
function totalSegmentLength(segments: PromptSegment[]): number {
  return segments.reduce(
    (acc, seg) => acc + (seg.type === "text" ? seg.content.length : seg.name.length),
    0,
  );
}

/**
 * Renders the rich placeholder overlay with brand badges.
 * As `charPos` advances, text appears character by character.
 * When a brand name finishes typing, it morphs into a badge with the Brandfetch logo.
 */
function RichPlaceholderOverlay({
  segments,
  charPos,
  showCursor = true,
}: {
  segments: PromptSegment[];
  charPos: number;
  showCursor?: boolean;
}) {
  let consumed = 0;
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segLen = seg.type === "text" ? seg.content.length : seg.name.length;

    if (consumed >= charPos) {
      // Haven't reached this segment yet
      break;
    }

    const charsAvailable = Math.min(segLen, charPos - consumed);
    consumed += segLen;

    if (seg.type === "text") {
      elements.push(<span key={i}>{seg.content.slice(0, charsAvailable)}</span>);
    } else {
      const fullyTyped = charsAvailable >= seg.name.length;
      if (fullyTyped) {
        // Show brand badge with fade-in animation
        elements.push(
          <span
            key={i}
            className="mx-0.5 inline-flex animate-[badge-in_150ms_ease-out] items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 align-middle text-xs font-medium text-slate-600"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={seg.icon} alt="" className="size-3.5 shrink-0 rounded-sm object-contain" />
            {seg.name}
          </span>,
        );
      } else {
        // Partially typed brand name — show as plain text
        elements.push(<span key={i}>{seg.name.slice(0, charsAvailable)}</span>);
      }
    }
  }

  return (
    <span className="inline" style={RICH_PLACEHOLDER_LINE_HEIGHT_STYLE}>
      {elements}
      {showCursor && charPos > 0 ? (
        <span
          className="ml-[1px] inline-block h-[1.1em] w-[2px] translate-y-[1px] bg-slate-600"
          style={RICH_PLACEHOLDER_CURSOR_STYLE}
        />
      ) : null}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PromptComposer({
  onSubmit,
  isSubmitting = false,
  placeholder,
  animatedPlaceholders,
  richAnimatedPlaceholders,
  onAnimatedPlaceholderIndexChange,
  variant = "hero",
  className,
}: PromptComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");

  // ── Plain placeholder animation state (fallback) ──
  const [placeholderText, setPlaceholderText] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isDeletingPlaceholder, setIsDeletingPlaceholder] = useState(false);

  // ── Rich placeholder animation state ──
  const [richCharPos, setRichCharPos] = useState(0);
  const [richIndex, setRichIndex] = useState(0);
  const [isRichDeleting, setIsRichDeleting] = useState(false);

  const useRichMode = Boolean(richAnimatedPlaceholders?.length);

  const resolvedPlaceholder = placeholder ?? "Describe what you want to automate...";
  const placeholderPool = useMemo(
    () =>
      animatedPlaceholders?.length
        ? animatedPlaceholders
        : [
            "First, brainstorm catchy automation ideas with me",
            "Help me turn rough ideas into sharp automation phrases",
            "Suggest 10 punchy automations I can build this week",
            "Draft a few standout automation hooks for my homepage",
          ],
    [animatedPlaceholders],
  );

  const shouldAnimate = variant === "hero" && text.length === 0;
  const shouldAnimatePlain = shouldAnimate && !useRichMode && placeholderPool.length > 0;
  const shouldAnimateRich = shouldAnimate && useRichMode;

  // ── Sync index to parent (for heading changes) ──
  useEffect(() => {
    if (!shouldAnimate || !onAnimatedPlaceholderIndexChange) {
      return;
    }
    const idx = useRichMode ? richIndex : placeholderIndex;
    onAnimatedPlaceholderIndexChange(idx);
  }, [onAnimatedPlaceholderIndexChange, placeholderIndex, richIndex, shouldAnimate, useRichMode]);

  // ── Plain placeholder typing animation ──
  useEffect(() => {
    if (!shouldAnimatePlain) {
      setPlaceholderText("");
      setPlaceholderIndex(0);
      setIsDeletingPlaceholder(false);
      return;
    }

    const currentPhrase = placeholderPool[placeholderIndex % placeholderPool.length];
    const isFullyTyped = placeholderText === currentPhrase;
    const isCleared = placeholderText.length === 0;
    const delay = isDeletingPlaceholder ? 35 : 50;

    let timeoutId: ReturnType<typeof setTimeout>;
    if (!isDeletingPlaceholder && isFullyTyped) {
      timeoutId = setTimeout(() => setIsDeletingPlaceholder(true), 1450);
    } else if (isDeletingPlaceholder && isCleared) {
      timeoutId = setTimeout(() => {
        setIsDeletingPlaceholder(false);
        setPlaceholderIndex((prev) => (prev + 1) % placeholderPool.length);
      }, 250);
    } else {
      timeoutId = setTimeout(() => {
        const next = isDeletingPlaceholder
          ? currentPhrase.slice(0, Math.max(0, placeholderText.length - 1))
          : currentPhrase.slice(0, placeholderText.length + 1);
        setPlaceholderText(next);
      }, delay);
    }

    return () => clearTimeout(timeoutId);
  }, [
    isDeletingPlaceholder,
    placeholderIndex,
    placeholderPool,
    placeholderText,
    shouldAnimatePlain,
  ]);

  // ── Rich placeholder typing animation ──
  useEffect(() => {
    if (!shouldAnimateRich || !richAnimatedPlaceholders?.length) {
      setRichCharPos(0);
      setRichIndex(0);
      setIsRichDeleting(false);
      return;
    }

    const currentSegments = richAnimatedPlaceholders[richIndex % richAnimatedPlaceholders.length];
    const total = totalSegmentLength(currentSegments);
    const isFullyTyped = richCharPos >= total;
    const isCleared = richCharPos <= 0;

    let timeoutId: ReturnType<typeof setTimeout>;

    if (!isRichDeleting && isFullyTyped) {
      // Pause then start deleting
      timeoutId = setTimeout(() => setIsRichDeleting(true), 1800);
    } else if (isRichDeleting && isCleared) {
      // Pause then move to next
      timeoutId = setTimeout(() => {
        setIsRichDeleting(false);
        setRichIndex((prev) => (prev + 1) % richAnimatedPlaceholders.length);
      }, 250);
    } else {
      // Type or delete one character
      const delay = isRichDeleting ? 20 : 40;
      timeoutId = setTimeout(() => {
        setRichCharPos((prev) => prev + (isRichDeleting ? -1 : 1));
      }, delay);
    }

    return () => clearTimeout(timeoutId);
  }, [shouldAnimateRich, richAnimatedPlaceholders, richIndex, richCharPos, isRichDeleting]);

  // Reset charPos when index changes
  useEffect(() => {
    setRichCharPos(0);
  }, [richIndex]);

  // ── Resolved placeholder for plain mode ──
  const activePlaceholder = shouldAnimatePlain
    ? placeholderText || placeholderPool[placeholderIndex] || resolvedPlaceholder
    : resolvedPlaceholder;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) {
      return;
    }

    onSubmit(trimmed);
    setText("");
  }, [isSubmitting, onSubmit, text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const currentRichSegments =
    richAnimatedPlaceholders?.[richIndex % (richAnimatedPlaceholders?.length || 1)];
  const richPlaceholderMeasureCharPos = currentRichSegments
    ? totalSegmentLength(currentRichSegments)
    : 0;

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "overflow-hidden rounded-2xl transition-shadow duration-200",
          variant === "hero"
            ? "border border-white/25 bg-white/88 shadow-[0_15px_45px_-22px_rgba(15,23,42,0.9)]"
            : "border border-border bg-card shadow-sm",
        )}
      >
        <div className="relative px-4 pt-4">
          <div
            className="pointer-events-none invisible text-sm leading-relaxed break-words whitespace-pre-wrap"
            aria-hidden
          >
            {text.length > 0 ? (
              <span>{text.endsWith("\n") ? `${text} ` : text}</span>
            ) : shouldAnimateRich && currentRichSegments ? (
              <RichPlaceholderOverlay
                segments={currentRichSegments}
                charPos={richPlaceholderMeasureCharPos}
                showCursor={false}
              />
            ) : (
              <span>{activePlaceholder || " "}</span>
            )}
          </div>
          {/* Rich animated placeholder overlay */}
          {shouldAnimateRich && currentRichSegments && (
            <div
              className="pointer-events-none absolute inset-0 px-4 pt-4 text-sm leading-relaxed text-slate-700/90"
              aria-hidden
            >
              <RichPlaceholderOverlay segments={currentRichSegments} charPos={richCharPos} />
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={shouldAnimateRich ? undefined : activePlaceholder}
            rows={2}
            className={cn(
              "absolute inset-0 z-10 min-h-12 w-full resize-none bg-transparent px-4 pt-4 text-sm leading-relaxed outline-none",
              variant === "hero"
                ? "placeholder:text-slate-700/90 text-slate-950"
                : "placeholder:text-muted-foreground/50 text-foreground",
            )}
          />
        </div>

        <div className="flex items-center justify-between px-4 pt-1 pb-3">
          <p
            className={cn(
              "text-xs",
              variant === "hero" ? "text-slate-700/90" : "text-muted-foreground/60",
            )}
          >
            {typeof navigator !== "undefined" && navigator.platform?.includes("Mac")
              ? "\u2318"
              : "Ctrl"}{" "}
            Enter to send
          </p>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!text.trim() || isSubmitting}
            className="gap-1.5 rounded-lg px-3"
          >
            {isSubmitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowUp className="size-3.5" />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
