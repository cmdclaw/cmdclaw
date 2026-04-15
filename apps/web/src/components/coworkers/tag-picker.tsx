"use client";

import { Check, Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useCoworkerTagList,
  useCreateCoworkerTag,
  useAssignCoworkerTag,
  useUnassignCoworkerTag,
} from "@/orpc/hooks";

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const;

type TagManagerContentProps = {
  coworkerId: string;
  currentTagIds: string[];
};

/**
 * Tag management UI — renders the tag list + create form inline.
 * No wrapper (no Popover, no Dropdown). The caller provides the container.
 */
export function TagManagerContent({ coworkerId, currentTagIds }: TagManagerContentProps) {
  const { data: tags } = useCoworkerTagList();
  const createTag = useCreateCoworkerTag();
  const assignTag = useAssignCoworkerTag();
  const unassignTag = useUnassignCoworkerTag();

  const [showCreate, setShowCreate] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>(PRESET_COLORS[5]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleToggleTag = useCallback(
    (tagId: string, isAssigned: boolean) => {
      if (isAssigned) {
        unassignTag.mutate({ coworkerId, tagIds: [tagId] });
      } else {
        assignTag.mutate({ coworkerId, tagIds: [tagId] });
      }
    },
    [coworkerId, assignTag, unassignTag],
  );

  const handleCreateTag = useCallback(async () => {
    const name = newTagName.trim();
    if (!name) {
      return;
    }

    try {
      const tag = await createTag.mutateAsync({ name, color: selectedColor });
      assignTag.mutate({ coworkerId, tagIds: [tag.id] });
      setNewTagName("");
      setShowCreate(false);
    } catch {
      // unique constraint — tag already exists
    }
  }, [newTagName, selectedColor, createTag, assignTag, coworkerId]);

  return (
    <>
      {/* Tag list */}
      <div className="max-h-48 overflow-y-auto p-1.5">
        {(tags ?? []).length === 0 && !showCreate && (
          <p className="text-muted-foreground px-2 py-3 text-center text-xs">No tags yet</p>
        )}
        {(tags ?? []).map((tag) => {
          const isAssigned = currentTagIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => handleToggleTag(tag.id, isAssigned)}
              className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors"
            >
              <div
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
                  isAssigned
                    ? "border-brand bg-brand text-primary-foreground"
                    : "border-input bg-transparent",
                )}
              >
                {isAssigned && <Check className="size-2.5" />}
              </div>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: tag.color || "#6b7280",
                  boxShadow: `0 0 3px ${tag.color || "#6b7280"}30`,
                }}
              />
              <span className="text-foreground truncate">{tag.name}</span>
              <span className="text-muted-foreground/50 ml-auto text-[10px] tabular-nums">
                {tag.coworkerCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* Separator + Create */}
      <div className="border-border/40 border-t p-1.5">
        {showCreate ? (
          <div className="space-y-2 px-1 py-1">
            <Input
              ref={inputRef}
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateTag();
                }
                if (e.key === "Escape") {
                  setShowCreate(false);
                  setNewTagName("");
                }
              }}
              placeholder="Tag name..."
              className="h-7 text-xs"
              autoFocus
            />
            <div className="flex items-center gap-1">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    "size-4 rounded-full border-2 transition-all",
                    selectedColor === color
                      ? "border-foreground scale-110"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleCreateTag}
                disabled={!newTagName.trim() || createTag.isPending}
                className="bg-foreground text-background hover:bg-foreground/90 flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setNewTagName("");
                }}
                className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowCreate(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors"
          >
            <Plus className="size-3.5" />
            Create new tag
          </button>
        )}
      </div>
    </>
  );
}
