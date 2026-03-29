"use client";

import type { ChangeEvent, MouseEvent } from "react";
import { TOP_UP_CREDITS_PER_USD, formatCredits } from "@cmdclaw/core/lib/billing-plans";
import { Loader2, Plus, Search, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useAdminBillingUserOverview, useAdminManualBillingTopUp } from "@/orpc/hooks";

type AdminListUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
};

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

const USER_LIST_SKELETON_KEYS = ["user-1", "user-2", "user-3", "user-4", "user-5"] as const;
const DETAIL_SKELETON_KEYS = ["detail-1", "detail-2", "detail-3"] as const;

function getInitials(name: string | null | undefined, email: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
    }
    return name.trim()[0]!.toUpperCase();
  }
  return email[0]!.toUpperCase();
}

function formatDateShort(value: string | number | Date | null | undefined): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function UserListSkeleton() {
  return (
    <div className="space-y-1.5">
      {USER_LIST_SKELETON_KEYS.map((key) => (
        <div key={key} className="flex items-center gap-3 rounded-md p-2.5">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {DETAIL_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-[68px] rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-px w-full" />
      <Skeleton className="h-28 rounded-lg" />
      <Skeleton className="h-px w-full" />
      <Skeleton className="h-40 rounded-lg" />
    </div>
  );
}

export default function AdminCreditsPage() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminListUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [topUpUsd, setTopUpUsd] = useState("25");

  const selectedUser = useMemo(
    () => users.find((candidate) => candidate.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );
  const overview = useAdminBillingUserOverview(selectedUserId);
  const manualTopUp = useAdminManualBillingTopUp();

  const loadUsers = useCallback(async (searchValue: string) => {
    setLoadingUsers(true);

    try {
      const trimmed = searchValue.trim();
      const result = await authClient.admin.listUsers({
        query: {
          searchValue: trimmed.length > 0 ? trimmed : undefined,
          searchField: "email",
          searchOperator: "contains",
          sortBy: "createdAt",
          sortDirection: "desc",
          limit: 20,
        },
      });

      if (result.error) {
        toast.error(result.error.message ?? "Failed to load users.");
        setUsers([]);
        setSelectedUserId(null);
        return;
      }

      const loaded = (result.data?.users ?? []) as AdminListUser[];
      setUsers(loaded);
      setSelectedUserId((current) => {
        if (!current) {
          return loaded[0]?.id ?? null;
        }
        return loaded.some((candidate) => candidate.id === current)
          ? current
          : (loaded[0]?.id ?? null);
      });
    } catch (error) {
      console.error("Failed to load admin users:", error);
      toast.error("Failed to load users.");
      setUsers([]);
      setSelectedUserId(null);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers("");
  }, [loadUsers]);

  const handleSearchSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await loadUsers(search);
    },
    [loadUsers, search],
  );

  const handleSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  }, []);

  const handleTopUpUsdChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setTopUpUsd(event.target.value);
  }, []);

  const handleSelectUser = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    setSelectedUserId(event.currentTarget.value);
  }, []);

  const activeWorkspace = overview.data?.activeWorkspace ?? null;
  const feature = overview.data?.feature as
    | {
        balance?: number | null;
        included_usage?: number;
        usage?: number;
        next_reset_at?: number | null;
        breakdown?: Array<{
          interval: string;
          balance?: number;
        }>;
      }
    | null
    | undefined;

  const breakdown = feature?.breakdown ?? [];
  const totalBalance = Math.max(0, Number(feature?.balance ?? 0));
  const topUpBalance = Math.max(
    0,
    Number(breakdown.find((item) => item.interval === "one_off")?.balance ?? 0),
  );
  const topUpPreviewCredits = Math.max(
    0,
    Math.floor(Number(topUpUsd || 0) * TOP_UP_CREDITS_PER_USD),
  );

  const handleTopUp = useCallback(async () => {
    if (!selectedUserId) {
      toast.error("Select a user first.");
      return;
    }

    if (!activeWorkspace) {
      toast.error("Selected user does not have an active workspace.");
      return;
    }

    const usdAmount = Number(topUpUsd);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      toast.error("Enter a positive USD amount.");
      return;
    }

    try {
      const result = await manualTopUp.mutateAsync({
        targetUserId: selectedUserId,
        usdAmount,
      });
      toast.success(
        `Granted ${formatCredits(result.creditsGranted)} credits to ${
          overview.data?.targetUser.email ?? "the selected user"
        }.`,
      );
      await overview.refetch();
    } catch (error) {
      toast.error(toErrorMessage(error, "Failed to grant credits."));
    }
  }, [activeWorkspace, manualTopUp, overview, selectedUserId, topUpUsd]);

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold tracking-tight">Admin Credits</h2>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* ─── User List ─── */}
        <section className="flex flex-col gap-3">
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={handleSearchChange}
                placeholder="Search by email…"
                className="pr-3 pl-9"
              />
            </div>
          </form>

          <ScrollArea className="h-[calc(100vh-240px)] min-h-[320px]">
            {loadingUsers ? (
              <UserListSkeleton />
            ) : users.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">No users found.</p>
            ) : (
              <div className="space-y-1">
                {users.map((user) => {
                  const isSelected = user.id === selectedUserId;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      value={user.id}
                      onClick={handleSelectUser}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors",
                        isSelected
                          ? "border-brand bg-brand/5 border ring-1 ring-brand/20"
                          : "hover:bg-muted/60 border border-transparent",
                      )}
                    >
                      <div
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                          isSelected
                            ? "bg-brand text-brand-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {getInitials(user.name, user.email)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">
                            {user.name || "Unnamed user"}
                          </p>
                          {user.role && (
                            <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                              {user.role}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground truncate font-mono text-xs">
                          {user.email}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </section>

        {/* ─── Detail Panel ─── */}
        <section>
          {!selectedUserId ? (
            <div className="bg-muted/20 flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
              <Wallet className="text-muted-foreground size-8" />
              <p className="mt-3 text-sm font-medium">Select a user</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Workspace billing details will appear here.
              </p>
            </div>
          ) : overview.isLoading ? (
            <div className="bg-card rounded-lg border p-6">
              <DetailSkeleton />
            </div>
          ) : overview.error ? (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
              {toErrorMessage(overview.error, "Failed to load billing details.")}
            </div>
          ) : overview.data ? (
            <div className="space-y-4">
              {/* User Header */}
              <div className="bg-card rounded-lg border p-5">
                <div className="flex items-center gap-4">
                  <div className="bg-brand text-brand-foreground flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold">
                    {getInitials(
                      overview.data.targetUser.name || selectedUser?.name,
                      overview.data.targetUser.email || selectedUser?.email || "",
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <h3 className="truncate text-lg font-semibold">
                        {overview.data.targetUser.name || selectedUser?.name || "Unnamed user"}
                      </h3>
                      {selectedUser?.role && (
                        <span className="bg-brand-muted text-brand shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                          {selectedUser.role}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground truncate font-mono text-sm">
                      {overview.data.targetUser.email || selectedUser?.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div
                  className={cn(
                    "rounded-lg border px-4 py-3",
                    activeWorkspace ? "bg-muted/40" : "border-amber-500/30 bg-amber-500/10",
                  )}
                >
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                    Workspace
                  </p>
                  <p className="mt-1 truncate text-sm font-medium">
                    {activeWorkspace?.name ?? "None"}
                  </p>
                  {activeWorkspace && (
                    <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                      {activeWorkspace.slug}
                    </p>
                  )}
                </div>

                <div className="bg-muted/40 rounded-lg border px-4 py-3">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                    Plan
                  </p>
                  <p className="mt-1 text-sm font-medium">{overview.data.plan?.name ?? "Free"}</p>
                </div>

                <div className="bg-muted/40 rounded-lg border px-4 py-3">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                    Balance
                  </p>
                  <p className="text-brand mt-1 font-mono text-lg font-semibold">
                    {formatCredits(totalBalance)}
                  </p>
                </div>
              </div>

              {/* Grant Credits */}
              <div className="bg-card rounded-lg border p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold">Grant Credits</h4>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      $1 = {TOP_UP_CREDITS_PER_USD} credits &middot; expires after 12 months
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                      Top-up bal.
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-semibold">
                      {formatCredits(topUpBalance)}
                    </p>
                  </div>
                </div>

                <div className="flex items-end gap-3">
                  <div className="w-28 shrink-0">
                    <label className="text-muted-foreground mb-1.5 block text-[11px] font-medium">
                      USD
                    </label>
                    <div className="relative">
                      <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                        $
                      </span>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={topUpUsd}
                        onChange={handleTopUpUsdChange}
                        className="pl-7 font-mono"
                      />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-muted-foreground mb-1.5 text-[11px] font-medium">
                      Credits to grant
                    </p>
                    <p className="text-brand font-mono text-xl leading-9 font-semibold">
                      {formatCredits(topUpPreviewCredits)}
                    </p>
                  </div>

                  <Button
                    variant="brand"
                    onClick={handleTopUp}
                    disabled={manualTopUp.isPending || !activeWorkspace}
                    className="shrink-0"
                  >
                    {manualTopUp.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Grant
                  </Button>
                </div>
              </div>

              {/* Recent Top-Ups */}
              <div className="bg-card rounded-lg border p-5">
                <h4 className="mb-3 text-sm font-semibold">Recent Top-Ups</h4>

                {overview.data.recentTopUps.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    No top-ups recorded yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                          <th className="px-3 py-2 text-left">Credits</th>
                          <th className="px-3 py-2 text-left">USD</th>
                          <th className="px-3 py-2 text-left">Granted</th>
                          <th className="px-3 py-2 text-left">Expires</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.data.recentTopUps.map((topUp) => (
                          <tr key={topUp.id} className="even:bg-muted/20 border-t">
                            <td className="text-brand px-3 py-2 font-mono font-semibold">
                              {formatCredits(topUp.creditsGranted)}
                            </td>
                            <td className="px-3 py-2 font-mono">${topUp.usdAmount}</td>
                            <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                              {formatDateShort(topUp.createdAt)}
                            </td>
                            <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                              {formatDateShort(topUp.expiresAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
