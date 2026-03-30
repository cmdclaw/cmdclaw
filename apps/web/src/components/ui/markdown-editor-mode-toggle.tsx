"use client";

import { Code, Eye } from "lucide-react";
import { useCallback, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

export type MarkdownEditorMode = "wysiwyg" | "source";

interface MarkdownEditorModeToggleProps {
  mode: MarkdownEditorMode;
  onModeChange: (mode: MarkdownEditorMode) => void;
}

export function MarkdownEditorModeToggle({ mode, onModeChange }: MarkdownEditorModeToggleProps) {
  const handleWysiwyg = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      onModeChange("wysiwyg");
    },
    [onModeChange],
  );

  const handleSource = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      onModeChange("source");
    },
    [onModeChange],
  );

  return (
    <div className="border-border/40 flex items-center rounded-md border">
      <button
        type="button"
        onClick={handleWysiwyg}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-l-md px-2.5 text-xs font-medium transition-colors",
          mode === "wysiwyg"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Eye className="h-3 w-3" />
        Preview
      </button>
      <button
        type="button"
        onClick={handleSource}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-r-md px-2.5 text-xs font-medium transition-colors",
          mode === "source"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Code className="h-3 w-3" />
        Code
      </button>
    </div>
  );
}
