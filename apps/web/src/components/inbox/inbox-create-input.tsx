"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { MockAgent } from "./inbox-mock-data";
import { MOCK_AGENTS } from "./inbox-mock-data";
import { useInboxStore } from "./inbox-store";

function AgentMenuItem({
  agent,
  isSelected,
  onSelect,
}: {
  agent: MockAgent;
  isSelected: boolean;
  onSelect: (agent: MockAgent) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(agent);
  }, [agent, onSelect]);

  return (
    <DropdownMenuItem
      onClick={handleClick}
      className={cn("text-[12px]", isSelected && "bg-accent")}
    >
      {agent.name}
    </DropdownMenuItem>
  );
}

export function InboxCreateInput() {
  const [title, setTitle] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<MockAgent>(MOCK_AGENTS[0]);
  const addItem = useInboxStore((s) => s.addItem);

  const handleSubmit = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    addItem(trimmed, selectedAgent.id);
    setTitle("");
  }, [title, selectedAgent, addItem]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleSelectAgent = useCallback((agent: MockAgent) => {
    setSelectedAgent(agent);
  }, []);

  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <Plus className="text-muted-foreground/40 h-4 w-4 shrink-0" />
      <input
        type="text"
        value={title}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Create new issue..."
        className="text-foreground placeholder:text-muted-foreground/40 h-7 flex-1 bg-transparent text-sm outline-none"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            {selectedAgent.name}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {MOCK_AGENTS.map((agent) => (
            <AgentMenuItem
              key={agent.id}
              agent={agent}
              isSelected={agent.id === selectedAgent.id}
              onSelect={handleSelectAgent}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
