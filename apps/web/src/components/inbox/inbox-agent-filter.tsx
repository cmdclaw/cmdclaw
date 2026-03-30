"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { InboxItemStatus, InboxSourceOption } from "./types";

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

type Props = {
  typeFilter: "all" | "coworkers" | "chats";
  onTypeFilterChange: (next: "all" | "coworkers" | "chats") => void;
  statusFilters: InboxItemStatus[];
  onToggleStatus: (status: InboxItemStatus) => void;
  sourceCoworkerId?: string;
  onSourceCoworkerChange: (coworkerId?: string) => void;
  sourceOptions: InboxSourceOption[];
};

export function InboxAgentFilter({
  typeFilter,
  onTypeFilterChange,
  statusFilters,
  onToggleStatus,
  sourceCoworkerId,
  onSourceCoworkerChange,
  sourceOptions,
}: Props) {
  const handleAllTypeClick = useCallback(() => {
    onTypeFilterChange("all");
  }, [onTypeFilterChange]);
  const handleCoworkersTypeClick = useCallback(() => {
    onTypeFilterChange("coworkers");
  }, [onTypeFilterChange]);
  const handleChatsTypeClick = useCallback(() => {
    onTypeFilterChange("chats");
  }, [onTypeFilterChange]);
  const handleAwaitingApprovalToggle = useCallback(() => {
    onToggleStatus("awaiting_approval");
  }, [onToggleStatus]);
  const handleAwaitingAuthToggle = useCallback(() => {
    onToggleStatus("awaiting_auth");
  }, [onToggleStatus]);
  const handleErrorToggle = useCallback(() => {
    onToggleStatus("error");
  }, [onToggleStatus]);
  const handleSourceChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextValue = event.target.value.trim();
      onSourceCoworkerChange(nextValue ? nextValue : undefined);
    },
    [onSourceCoworkerChange],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label="All" active={typeFilter === "all"} onClick={handleAllTypeClick} />
        <FilterChip
          label="Coworkers"
          active={typeFilter === "coworkers"}
          onClick={handleCoworkersTypeClick}
        />
        <FilterChip label="Chats" active={typeFilter === "chats"} onClick={handleChatsTypeClick} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="Awaiting approval"
          active={statusFilters.includes("awaiting_approval")}
          onClick={handleAwaitingApprovalToggle}
        />
        <FilterChip
          label="Awaiting auth"
          active={statusFilters.includes("awaiting_auth")}
          onClick={handleAwaitingAuthToggle}
        />
        <FilterChip
          label="Error"
          active={statusFilters.includes("error")}
          onClick={handleErrorToggle}
        />

        <select
          value={typeFilter === "chats" ? "" : (sourceCoworkerId ?? "")}
          onChange={handleSourceChange}
          disabled={typeFilter === "chats" || sourceOptions.length === 0}
          className="bg-background text-foreground border-border/50 h-8 rounded-md border px-2.5 text-[12px] outline-none disabled:opacity-50"
        >
          <option value="">All coworkers</option>
          {sourceOptions.map((option) => (
            <option key={option.coworkerId} value={option.coworkerId}>
              {option.coworkerName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
