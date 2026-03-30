"use client";

import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { MOCK_AGENTS } from "./inbox-mock-data";
import { useInboxStore } from "./inbox-store";

function FilterChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
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
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "tabular-nums text-[10px]",
            active ? "text-background/60" : "text-muted-foreground/50",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function InboxAgentFilter() {
  const items = useInboxStore((s) => s.items);
  const agentFilter = useInboxStore((s) => s.agentFilter);
  const setAgentFilter = useInboxStore((s) => s.setAgentFilter);

  const agentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.agentId, (counts.get(item.agentId) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  // Only show agents that have items
  const activeAgents = useMemo(
    () => MOCK_AGENTS.filter((agent) => agentCounts.has(agent.id)),
    [agentCounts],
  );

  const handleAllClick = useCallback(() => {
    setAgentFilter(null);
  }, [setAgentFilter]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip
        label="All"
        active={agentFilter === null}
        count={items.length}
        onClick={handleAllClick}
      />
      {activeAgents.map((agent) => (
        <AgentFilterChip
          key={agent.id}
          agentId={agent.id}
          agentName={agent.name}
          count={agentCounts.get(agent.id) ?? 0}
          active={agentFilter === agent.id}
          onSelect={setAgentFilter}
        />
      ))}
    </div>
  );
}

function AgentFilterChip({
  agentId,
  agentName,
  count,
  active,
  onSelect,
}: {
  agentId: string;
  agentName: string;
  count: number;
  active: boolean;
  onSelect: (id: string | null) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(active ? null : agentId);
  }, [active, agentId, onSelect]);

  return <FilterChip label={agentName} active={active} count={count} onClick={handleClick} />;
}
