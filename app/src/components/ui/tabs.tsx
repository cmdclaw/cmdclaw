"use client";

import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";
import { useId, useRef } from "react";
import { cn } from "@/lib/utils";

const ACTIVE_TAB_PILL_TRANSITION = { type: "spring", stiffness: 400, damping: 30 } as const;

/* ─── AnimatedTabs ─── */

type AnimatedTabsProps = {
  activeKey: string;
  onTabChange?: (key: string) => void;
  children: React.ReactNode;
  className?: string;
};

function AnimatedTabs({ activeKey, onTabChange, children, className }: AnimatedTabsProps) {
  const id = useId();
  const stableId = useRef(id);
  const layoutId = `tab-pill-${stableId.current}`;

  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-0.5 rounded-lg p-1", className)}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement<AnimatedTabProps>(child)) {
          return child;
        }
        const tabValue = child.props.value;
        return React.cloneElement(child, {
          _active: tabValue === activeKey,
          _layoutId: layoutId,
          _onSelect: onTabChange,
        });
      })}
    </div>
  );
}

/* ─── AnimatedTab ─── */

type AnimatedTabProps = {
  value: string;
  children: React.ReactNode;
  href?: string;
  className?: string;
  /** @internal */ _active?: boolean;
  /** @internal */ _layoutId?: string;
  /** @internal */ _onSelect?: (key: string) => void;
};

function AnimatedTab({
  value,
  children,
  href,
  className,
  _active,
  _layoutId,
  _onSelect,
}: AnimatedTabProps) {
  const handleClick = React.useCallback(() => {
    _onSelect?.(value);
  }, [_onSelect, value]);

  const inner = (
    <>
      {_active && (
        <motion.span
          layoutId={_layoutId}
          className="bg-muted absolute inset-0 rounded-md"
          transition={ACTIVE_TAB_PILL_TRANSITION}
        />
      )}
      <span className="relative z-10">{children}</span>
    </>
  );

  const sharedClass = cn(
    "relative inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
    _active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
    className,
  );

  if (href) {
    return (
      <Link href={href} prefetch={false} role="tab" aria-selected={_active} className={sharedClass}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={_active}
      onClick={handleClick}
      className={sharedClass}
    >
      {inner}
    </button>
  );
}

export { AnimatedTabs, AnimatedTab };
