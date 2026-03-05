"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PromptComposerProps = {
  onSubmit: (text: string) => void;
  isSubmitting?: boolean;
  placeholder?: string;
  /** Visual variant: "hero" for landing dark bg, "embedded" for editor light bg */
  variant?: "hero" | "embedded";
  className?: string;
};

// ─── PromptComposer ───────────────────────────────────────────────────────────

export function PromptComposer({
  onSubmit,
  isSubmitting = false,
  placeholder,
  variant = "hero",
  className,
}: PromptComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");

  const resolvedPlaceholder = placeholder ?? "Describe what you want to automate...";

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
  }, [text, isSubmitting, onSubmit]);

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
        {/* Textarea */}
        <div className="px-4 pt-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={resolvedPlaceholder}
            rows={2}
            className={cn(
              "min-h-12 w-full resize-none bg-transparent text-sm leading-relaxed outline-none",
              variant === "hero"
                ? "placeholder:text-slate-400/60 text-slate-900"
                : "placeholder:text-muted-foreground/50 text-foreground",
            )}
          />
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-4 pt-1 pb-3">
          <p
            className={cn(
              "text-xs",
              variant === "hero" ? "text-slate-700/60" : "text-muted-foreground/60",
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
