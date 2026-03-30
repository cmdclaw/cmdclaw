"use client";

import { CircleDot, History } from "lucide-react";
import { useMemo } from "react";
import { InboxItem } from "./inbox-item";
import { useInboxStore } from "./inbox-store";

const NEEDS_ACTION_STATUSES = new Set(["awaiting_approval", "awaiting_auth", "error"]);

function SectionHeader({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 px-1 py-2">
      <Icon className="text-muted-foreground/60 h-3.5 w-3.5" />
      <span className="text-muted-foreground/60 text-[11px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <span className="text-muted-foreground/40 text-[11px] tabular-nums">{count}</span>
    </div>
  );
}

export function InboxList() {
  const items = useInboxStore((s) => s.items);
  const agentFilter = useInboxStore((s) => s.agentFilter);
  const searchQuery = useInboxStore((s) => s.searchQuery);

  const filtered = useMemo(() => {
    let result = items;
    if (agentFilter) {
      result = result.filter((item) => item.agentId === agentFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) => item.title.toLowerCase().includes(q) || item.agentName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, agentFilter, searchQuery]);

  const { needsAction, recent } = useMemo(() => {
    const needsAction = filtered.filter((item) => NEEDS_ACTION_STATUSES.has(item.status));
    const recent = filtered.filter((item) => !NEEDS_ACTION_STATUSES.has(item.status));
    return { needsAction, recent };
  }, [filtered]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-16">
        <div className="space-y-2 text-center">
          <p className="text-muted-foreground text-sm font-medium">
            {agentFilter ? "No items for this agent" : "No items in inbox"}
          </p>
          <p className="text-muted-foreground/60 text-[13px]">
            Agent runs and issues will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {needsAction.length > 0 && (
        <div>
          <SectionHeader icon={CircleDot} label="Needs action" count={needsAction.length} />
          <div className="space-y-2">
            {needsAction.map((item) => (
              <InboxItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <SectionHeader icon={History} label="Recent" count={recent.length} />
          <div className="space-y-2">
            {recent.map((item) => (
              <InboxItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
