"use client";

import { X } from "lucide-react";
import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";

const TAG_FALLBACK_COLOR = "#6b7280";

type TagBadgeProps = {
  name: string;
  color?: string | null;
  size?: "sm" | "default";
  onRemove?: () => void;
  onClick?: () => void;
};

export function TagBadge({ name, color, size = "default", onRemove, onClick }: TagBadgeProps) {
  const dotColor = color || TAG_FALLBACK_COLOR;
  const isSmall = size === "sm";
  const dotStyle = useMemo(
    () => ({
      backgroundColor: dotColor,
      width: isSmall ? 5 : 6,
      height: isSmall ? 5 : 6,
      boxShadow: `0 0 4px ${dotColor}40`,
    }),
    [dotColor, isSmall],
  );
  const handleRemoveClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onRemove?.();
    },
    [onRemove],
  );

  const content = (
    <>
      <span className="shrink-0 rounded-full" style={dotStyle} />
      <span className="max-w-[100px] truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={handleRemoveClick}
          className="text-muted-foreground/60 hover:text-foreground -mr-0.5 shrink-0 transition-colors"
        >
          <X className={isSmall ? "size-2.5" : "size-3"} />
        </button>
      )}
    </>
  );

  const classes = cn(
    "inline-flex items-center gap-1 rounded-full border transition-colors",
    isSmall
      ? "border-border/40 bg-muted/50 text-muted-foreground px-1.5 py-px text-[10px]"
      : "border-border/50 bg-muted/60 text-muted-foreground px-2 py-0.5 text-[11px]",
    onClick && "cursor-pointer hover:border-border hover:text-foreground",
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }

  return <span className={classes}>{content}</span>;
}
