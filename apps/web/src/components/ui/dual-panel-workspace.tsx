"use client";

import { ChevronLeft, ChevronRight, PanelRight } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DualPanelWorkspaceProps = {
  left: ReactNode;
  right: ReactNode;
  leftTitle?: string;
  rightTitle?: string;
  defaultRightWidth?: number;
  minLeftWidth?: number;
  minRightWidth?: number;
  storageKey?: string;
  className?: string;
  collapsible?: boolean;
  defaultRightCollapsed?: boolean;
  showTitles?: boolean;
  leftPanelClassName?: string;
  rightPanelClassName?: string;
  separatorClassName?: string;
  /** Label shown on the collapsed sidebar button (e.g. coworker name). When set, replaces the chevron with a labeled button. */
  collapsedLabel?: string;
  /** Hide the separator collapse button while expanded when the panel already offers its own close affordance. */
  showExpandedCollapseButton?: boolean;
  /** Expose collapse toggle so child content can trigger it (e.g. an X close button inside the panel). */
  onCollapseToggleRef?: React.MutableRefObject<(() => void) | null>;
  /** Hide the built-in mobile toggle buttons (useful when the parent provides its own mobile layout). */
  hideMobileToggle?: boolean;
};

const DEFAULT_RIGHT_WIDTH = 48;
const DEFAULT_MIN_LEFT = 28;
const DEFAULT_MIN_RIGHT = 30;
const COLLAPSED_SEPARATOR_WIDTH_REM = 2;

export function DualPanelWorkspace({
  left,
  right,
  leftTitle = "Assistant",
  rightTitle = "Editor",
  defaultRightWidth = DEFAULT_RIGHT_WIDTH,
  minLeftWidth = DEFAULT_MIN_LEFT,
  minRightWidth = DEFAULT_MIN_RIGHT,
  storageKey,
  className,
  collapsible = false,
  defaultRightCollapsed = false,
  showTitles = true,
  leftPanelClassName,
  rightPanelClassName,
  separatorClassName,
  collapsedLabel,
  showExpandedCollapseButton = true,
  onCollapseToggleRef,
  hideMobileToggle = false,
}: DualPanelWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mobilePanel, setMobilePanel] = useState<"left" | "right">("right");
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultRightCollapsed);
  const savedWidthRef = useRef<number | null>(null);
  const [rightWidth, setRightWidth] = useState(() => {
    if (!storageKey || typeof window === "undefined") {
      return defaultRightWidth;
    }
    const saved = window.localStorage.getItem(storageKey);
    const parsed = Number(saved);
    if (!Number.isFinite(parsed)) {
      return defaultRightWidth;
    }
    const maxRight = 100 - minLeftWidth;
    const minRight = minRightWidth;
    return Math.min(Math.max(minRight, maxRight), Math.max(minRight, parsed));
  });

  const bounds = useMemo(() => {
    const maxRight = 100 - minLeftWidth;
    const minRight = minRightWidth;
    return {
      minRight,
      maxRight: Math.max(minRight, maxRight),
    };
  }, [minLeftWidth, minRightWidth]);

  const setWidthWithinBounds = useCallback(
    (value: number) => {
      const next = Math.min(bounds.maxRight, Math.max(bounds.minRight, value));
      setRightWidth(next);
      if (storageKey && typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, String(next));
      }
    },
    [bounds.maxRight, bounds.minRight, storageKey],
  );

  const onPointerMove = useCallback(
    (event: globalThis.PointerEvent) => {
      if (!containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const leftPct = (x / rect.width) * 100;
      const nextRight = 100 - leftPct;
      setWidthWithinBounds(nextRight);
    },
    [setWidthWithinBounds],
  );

  const stopDrag = useCallback(() => {
    setIsDragging(false);
  }, []);

  const startDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerUp = () => stopDrag();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, onPointerMove, stopDrag]);

  const handleCollapseToggle = useCallback(() => {
    if (isCollapsed) {
      // Restore saved width
      const restoreWidth = savedWidthRef.current ?? defaultRightWidth;
      setWidthWithinBounds(restoreWidth);
      setIsCollapsed(false);
    } else {
      // Save current width and collapse
      savedWidthRef.current = rightWidth;
      setIsCollapsed(true);
    }
  }, [isCollapsed, rightWidth, defaultRightWidth, setWidthWithinBounds]);

  // Expose collapse toggle to child content
  useEffect(() => {
    if (onCollapseToggleRef) {
      onCollapseToggleRef.current = handleCollapseToggle;
    }
    return () => {
      if (onCollapseToggleRef) {
        onCollapseToggleRef.current = null;
      }
    };
  }, [handleCollapseToggle, onCollapseToggleRef]);

  const effectiveRightWidth = isCollapsed ? 0 : rightWidth;
  const leftWidth = 100 - effectiveRightWidth;
  const switchToLeftPanel = useCallback(() => {
    setMobilePanel("left");
  }, []);
  const switchToRightPanel = useCallback(() => {
    setMobilePanel("right");
  }, []);
  const leftPanelStyle = useMemo(
    () =>
      isCollapsed
        ? { width: `calc(100% - ${COLLAPSED_SEPARATOR_WIDTH_REM}rem)` }
        : { width: `${leftWidth}%` },
    [isCollapsed, leftWidth],
  );
  const rightPanelStyle = useMemo(
    () =>
      isCollapsed
        ? {
            width: "0%",
            minWidth: 0,
          }
        : { width: `${effectiveRightWidth}%` },
    [effectiveRightWidth, isCollapsed],
  );
  const handleSeparatorKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        setWidthWithinBounds(rightWidth + 2);
      }
      if (event.key === "ArrowRight") {
        setWidthWithinBounds(rightWidth - 2);
      }
    },
    [rightWidth, setWidthWithinBounds],
  );

  return (
    <div className={cn("flex min-h-0 w-full flex-1 flex-col", className)}>
      {!hideMobileToggle && (
        <div className="mb-3 flex items-center gap-2 md:hidden">
          <Button
            type="button"
            variant={mobilePanel === "left" ? "default" : "outline"}
            size="sm"
            onClick={switchToLeftPanel}
          >
            {leftTitle}
          </Button>
          <Button
            type="button"
            variant={mobilePanel === "right" ? "default" : "outline"}
            size="sm"
            onClick={switchToRightPanel}
          >
            {rightTitle}
          </Button>
        </div>
      )}

      {!hideMobileToggle && (
        <div className="flex min-h-0 flex-1 md:hidden">
          {mobilePanel === "left" ? (
            <section
              className={cn(
                "bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border",
                leftPanelClassName,
              )}
            >
              {showTitles && (
                <div className="text-muted-foreground border-b px-4 py-2.5 text-xs font-semibold tracking-wide uppercase">
                  {leftTitle}
                </div>
              )}
              <div className="flex min-h-0 flex-1 flex-col">{left}</div>
            </section>
          ) : (
            <section
              className={cn(
                "bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border",
                rightPanelClassName,
              )}
            >
              {showTitles && (
                <div className="text-muted-foreground border-b px-4 py-2.5 text-xs font-semibold tracking-wide uppercase">
                  {rightTitle}
                </div>
              )}
              <div className="flex min-h-0 flex-1 flex-col">{right}</div>
            </section>
          )}
        </div>
      )}

      <div ref={containerRef} className="hidden min-h-0 flex-1 md:flex">
        <section
          className={cn(
            "bg-background flex min-h-0 flex-col overflow-hidden rounded-l-xl border transition-[width] duration-200 ease-out",
            leftPanelClassName,
          )}
          style={leftPanelStyle}
        >
          {showTitles && (
            <div className="text-muted-foreground border-b px-4 py-2.5 text-xs font-semibold tracking-wide uppercase">
              {leftTitle}
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{left}</div>
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          tabIndex={collapsible ? -1 : 0}
          onPointerDown={isCollapsed ? undefined : startDrag}
          onKeyDown={isCollapsed ? undefined : handleSeparatorKeyDown}
          className={cn(
            "relative shrink-0 transition-[width] duration-200 ease-out",
            isCollapsed ? "w-8" : "w-3",
            !isCollapsed && "cursor-col-resize",
          )}
        >
          {!isCollapsed && (
            <>
              {separatorClassName ? (
                <div
                  aria-hidden="true"
                  className={cn("absolute inset-y-0 left-1/2 right-0", separatorClassName)}
                />
              ) : null}
              <div className="bg-border absolute inset-y-0 left-1/2 w-px -translate-x-1/2" />
            </>
          )}
          {collapsible &&
            (isCollapsed || showExpandedCollapseButton) &&
            (collapsedLabel ? (
              // Labeled collapse button — only visible when collapsed; when expanded, the panel provides its own close button
              isCollapsed && (
                <button
                  type="button"
                  onClick={handleCollapseToggle}
                  className="hover:bg-muted bg-background absolute top-3 right-2 z-10 flex items-center gap-1.5 rounded-lg border py-1.5 pr-2 pl-2.5 text-xs font-medium shadow-sm transition-colors"
                  aria-label="Expand right panel"
                >
                  <PanelRight className="h-3.5 w-3.5" />
                  {collapsedLabel}
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={handleCollapseToggle}
                className="hover:bg-muted bg-background absolute top-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm transition-colors"
                aria-label={isCollapsed ? "Expand right panel" : "Collapse right panel"}
              >
                {isCollapsed ? (
                  <ChevronLeft className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            ))}
        </div>

        <section
          className={cn(
            "bg-background flex min-h-0 flex-col overflow-hidden rounded-r-xl border transition-[width] duration-200 ease-out",
            isCollapsed && "border-0",
            rightPanelClassName,
          )}
          style={rightPanelStyle}
        >
          {!isCollapsed && (
            <>
              {showTitles && (
                <div className="text-muted-foreground border-b px-4 py-2.5 text-xs font-semibold tracking-wide uppercase">
                  {rightTitle}
                </div>
              )}
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{right}</div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
