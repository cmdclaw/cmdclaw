import { useGT } from "gt-react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import type { InboxItemStatus } from "./types";
import { InboxCoworkerSelector, type InboxCoworkerSelectorItem } from "./inbox-coworker-selector";

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
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
        active
          ? "border-foreground/20 bg-muted text-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

type Props = {
  statusFilters: InboxItemStatus[];
  onToggleStatus: (status: InboxItemStatus) => void;
  sourceCoworkerId?: string;
  onSourceCoworkerChange: (coworkerId?: string) => void;
  coworkers: InboxCoworkerSelectorItem[];
  isLoadingCoworkers?: boolean;
};

export function InboxAgentFilter({
  statusFilters,
  onToggleStatus,
  sourceCoworkerId,
  onSourceCoworkerChange,
  coworkers,
  isLoadingCoworkers,
}: Props) {
  const t = useGT();

  const handleAwaitingApprovalToggle = useCallback(() => {
    onToggleStatus("awaiting_approval");
  }, [onToggleStatus]);
  const handleNeedsUserInputToggle = useCallback(() => {
    onToggleStatus("needs_user_input");
  }, [onToggleStatus]);
  const handleRunningToggle = useCallback(() => {
    onToggleStatus("running");
  }, [onToggleStatus]);
  const handleAwaitingAuthToggle = useCallback(() => {
    onToggleStatus("awaiting_auth");
  }, [onToggleStatus]);
  const handlePausedToggle = useCallback(() => {
    onToggleStatus("paused");
  }, [onToggleStatus]);
  const handleCompletedToggle = useCallback(() => {
    onToggleStatus("completed");
  }, [onToggleStatus]);
  const handleErrorToggle = useCallback(() => {
    onToggleStatus("error");
  }, [onToggleStatus]);
  const handleCancelledToggle = useCallback(() => {
    onToggleStatus("cancelled");
  }, [onToggleStatus]);

  return (
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <FilterChip
          label={t("Needs your input")}
          active={statusFilters.includes("needs_user_input")}
          onClick={handleNeedsUserInputToggle}
        />
        <FilterChip
          label={t("Awaiting approval")}
          active={statusFilters.includes("awaiting_approval")}
          onClick={handleAwaitingApprovalToggle}
        />
        <FilterChip
          label={t("Running")}
          active={statusFilters.includes("running")}
          onClick={handleRunningToggle}
        />
        <FilterChip
          label={t("Awaiting auth")}
          active={statusFilters.includes("awaiting_auth")}
          onClick={handleAwaitingAuthToggle}
        />
        <FilterChip
          label={t("Needs continuation")}
          active={statusFilters.includes("paused")}
          onClick={handlePausedToggle}
        />
        <FilterChip
          label={t("Completed")}
          active={statusFilters.includes("completed")}
          onClick={handleCompletedToggle}
        />
        <FilterChip
          label={t("Error")}
          active={statusFilters.includes("error")}
          onClick={handleErrorToggle}
        />
        <FilterChip
          label={t("Cancelled")}
          active={statusFilters.includes("cancelled")}
          onClick={handleCancelledToggle}
        />
      </div>
      <div className="w-full shrink-0 lg:w-[320px]">
        <InboxCoworkerSelector
          coworkers={coworkers}
          selectedCoworkerId={sourceCoworkerId}
          onSelectCoworker={onSourceCoworkerChange}
          isLoading={isLoadingCoworkers}
        />
      </div>
    </div>
  );
}
