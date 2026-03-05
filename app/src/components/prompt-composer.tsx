"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PromptComposerProps = {
  onSubmit: (text: string) => void;
  isSubmitting?: boolean;
  placeholder?: string;
  animatedPlaceholders?: string[];
  onAnimatedPlaceholderIndexChange?: (index: number) => void;
  variant?: "hero" | "embedded";
  className?: string;
};

export function PromptComposer({
  onSubmit,
  isSubmitting = false,
  placeholder,
  animatedPlaceholders,
  onAnimatedPlaceholderIndexChange,
  variant = "hero",
  className,
}: PromptComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [placeholderText, setPlaceholderText] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isDeletingPlaceholder, setIsDeletingPlaceholder] = useState(false);

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

  const shouldAnimatePlaceholder =
    variant === "hero" && text.length === 0 && placeholderPool.length > 0;

  useEffect(() => {
    if (!shouldAnimatePlaceholder || !onAnimatedPlaceholderIndexChange) {
      return;
    }
    onAnimatedPlaceholderIndexChange(placeholderIndex);
  }, [onAnimatedPlaceholderIndexChange, placeholderIndex, shouldAnimatePlaceholder]);

  useEffect(() => {
    if (!shouldAnimatePlaceholder) {
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
    shouldAnimatePlaceholder,
  ]);

  const activePlaceholder = shouldAnimatePlaceholder
    ? placeholderText || placeholderPool[placeholderIndex] || resolvedPlaceholder
    : resolvedPlaceholder;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) {
      return;
    }

    onSubmit(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
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
        <div className="px-4 pt-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={activePlaceholder}
            rows={2}
            className={cn(
              "min-h-12 w-full resize-none bg-transparent text-sm leading-relaxed outline-none",
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
