"use client";

import type { ChangeEvent, MouseEvent } from "react";
import { TOP_UP_CREDITS_PER_USD, formatCredits } from "@cmdclaw/core/lib/billing-plans";
import { Loader2, Search, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) {
    return "N/A";
  }
  return new Date(value).toLocaleString();
}

export default function AdminCreditsPage() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminListUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [topUpUsd, setTopUpUsd] = useState("25");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((candidate) => candidate.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );
  const overview = useAdminBillingUserOverview(selectedUserId);
  const manualTopUp = useAdminManualBillingTopUp();

  const loadUsers = useCallback(async (searchValue: string) => {
    setLoadingUsers(true);
    setListError(null);

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
        setListError(result.error.message ?? "Failed to load users.");
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
      setListError("Failed to load users.");
      setUsers([]);
      setSelectedUserId(null);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers("");
  }, [loadUsers]);

  useEffect(() => {
    setActionError(null);
    setActionMessage(null);
  }, [selectedUserId]);

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
    setActionError(null);
    setActionMessage(null);

    if (!selectedUserId) {
      setActionError("Select a user first.");
      return;
    }

    if (!activeWorkspace) {
      setActionError("Selected user does not have an active workspace.");
      return;
    }

    const usdAmount = Number(topUpUsd);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      setActionError("Enter a positive USD amount.");
      return;
    }

    try {
      const result = await manualTopUp.mutateAsync({
        targetUserId: selectedUserId,
        usdAmount,
      });
      setActionMessage(
        `Granted ${formatCredits(result.creditsGranted)} credits to ${
          overview.data?.targetUser.email ?? "the selected user"
        }.`,
      );
      await overview.refetch();
    } catch (error) {
      setActionError(toErrorMessage(error, "Failed to grant credits."));
    }
  }, [activeWorkspace, manualTopUp, overview, selectedUserId, topUpUsd]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Admin Credits</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Search users, inspect their active workspace credit state, and add manual top-ups.
        </p>
      </div>

      {(actionError || actionMessage) && (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm",
            actionError
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300",
          )}
        >
          {actionError ?? actionMessage}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="border-border/60 bg-muted/20 rounded-lg border p-5">
          <form onSubmit={handleSearchSubmit} className="mb-4 flex flex-col gap-3">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={handleSearchChange}
                placeholder="Search users by email"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="outline" disabled={loadingUsers}>
              {loadingUsers ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                "Search"
              )}
            </Button>
          </form>

          {listError ? <p className="text-destructive mb-3 text-sm">{listError}</p> : null}

          {loadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-sm">No users found.</p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => {
                const isSelected = user.id === selectedUserId;
                return (
                  <button
                    key={user.id}
                    type="button"
                    value={user.id}
                    onClick={handleSelectUser}
                    className={cn(
                      "bg-background w-full rounded-lg border p-3 text-left transition-colors",
                      isSelected
                        ? "border-[#B55239] bg-[#B55239]/5"
                        : "hover:border-foreground/15 border-border",
                    )}
                  >
                    <p className="text-sm font-medium">{user.name || "Unnamed user"}</p>
                    <p className="text-muted-foreground text-xs">{user.email}</p>
                    {user.role ? (
                      <p className="text-muted-foreground mt-1 text-xs">{user.role}</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          {!selectedUserId ? (
            <div className="border-border/60 bg-muted/20 rounded-lg border p-8 text-center">
              <Wallet className="text-muted-foreground mx-auto h-6 w-6" />
              <p className="mt-3 text-sm font-medium">Select a user to inspect credits</p>
              <p className="text-muted-foreground mt-1 text-sm">
                The selected user&apos;s active workspace billing state will appear here.
              </p>
            </div>
          ) : overview.isLoading ? (
            <div className="flex items-center justify-center rounded-lg border py-14">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : overview.error ? (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
              {toErrorMessage(overview.error, "Failed to load billing details.")}
            </div>
          ) : overview.data ? (
            <>
              <div className="bg-card rounded-lg border p-5">
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {overview.data.targetUser.name || selectedUser?.name || "Unnamed user"}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {overview.data.targetUser.email || selectedUser?.email}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="bg-muted/40 rounded-lg border px-4 py-3">
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Workspace
                      </p>
                      <p className="text-sm font-medium">
                        {activeWorkspace?.name ?? "Unavailable"}
                      </p>
                    </div>
                    <div className="bg-muted/40 rounded-lg border px-4 py-3">
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Plan
                      </p>
                      <p className="text-sm font-medium">
                        {overview.data.plan?.name ?? "No active workspace"}
                      </p>
                    </div>
                    <div className="bg-muted/40 rounded-lg border px-4 py-3">
                      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                        Total balance
                      </p>
                      <p className="text-sm font-medium">{formatCredits(totalBalance)}</p>
                    </div>
                  </div>
                </div>

                {activeWorkspace ? (
                  <p className="text-muted-foreground mt-4 text-sm">
                    Active workspace slug:{" "}
                    <span className="text-foreground">{activeWorkspace.slug}</span>
                  </p>
                ) : (
                  <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                    This user does not currently have a usable active workspace, so credits cannot
                    be granted from admin.
                  </div>
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
                <div className="bg-card rounded-lg border p-5">
                  <div className="mb-4">
                    <h4 className="text-base font-semibold">Manual top-up</h4>
                    <p className="text-muted-foreground mt-1 text-sm">
                      $1 = {TOP_UP_CREDITS_PER_USD} credits. Top-ups expire after 12 months.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <div className="bg-muted/40 rounded-lg border px-4 py-3">
                        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                          Top-up balance
                        </p>
                        <p className="text-lg font-semibold">{formatCredits(topUpBalance)}</p>
                      </div>
                      <div className="bg-muted/40 rounded-lg border px-4 py-3">
                        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                          Preview
                        </p>
                        <p className="text-lg font-semibold">
                          {formatCredits(topUpPreviewCredits)}
                        </p>
                      </div>
                    </div>

                    <div className="relative max-w-[180px]">
                      <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                        $
                      </span>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={topUpUsd}
                        onChange={handleTopUpUsdChange}
                        className="pl-7"
                      />
                    </div>

                    <Button
                      onClick={handleTopUp}
                      disabled={manualTopUp.isPending || !activeWorkspace}
                      className="w-full"
                    >
                      {manualTopUp.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Granting...
                        </>
                      ) : (
                        `Add ${formatCredits(topUpPreviewCredits)} credits`
                      )}
                    </Button>
                  </div>
                </div>

                <div className="bg-card rounded-lg border p-5">
                  <div className="mb-4">
                    <h4 className="text-base font-semibold">Recent top-ups</h4>
                    <p className="text-muted-foreground mt-1 text-sm">
                      Latest manual credit grants for this active workspace.
                    </p>
                  </div>

                  {overview.data.recentTopUps.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No top-ups recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Granted</th>
                            <th className="px-3 py-2 text-left font-medium">USD</th>
                            <th className="px-3 py-2 text-left font-medium">Created</th>
                            <th className="px-3 py-2 text-left font-medium">Expires</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.data.recentTopUps.map((topUp) => (
                            <tr key={topUp.id} className="border-t">
                              <td className="px-3 py-2 font-medium">
                                {formatCredits(topUp.creditsGranted)}
                              </td>
                              <td className="px-3 py-2">${topUp.usdAmount}</td>
                              <td className="text-muted-foreground px-3 py-2">
                                {formatDateTime(topUp.createdAt)}
                              </td>
                              <td className="text-muted-foreground px-3 py-2">
                                {formatDateTime(topUp.expiresAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
