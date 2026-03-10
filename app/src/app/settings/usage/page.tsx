"use client";

import type { ChangeEvent } from "react";
import { Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BILLING_PLANS, TOP_UP_CREDITS_PER_USD, formatCredits } from "@/lib/billing-plans";
import { useBillingOverview, useManualBillingTopUp } from "@/orpc/hooks";

function formatDate(value: number | string | Date | null | undefined): string {
  if (!value) {
    return "N/A";
  }
  return new Date(value).toLocaleDateString();
}

export default function UsagePage() {
  const { data, isLoading, refetch } = useBillingOverview();
  const manualTopUp = useManualBillingTopUp();
  const [topUpUsd, setTopUpUsd] = useState("25");

  const plan = data?.plan ?? BILLING_PLANS.free;
  const feature = data?.feature as
    | {
        balance?: number | null;
        included_usage?: number;
        usage?: number;
        next_reset_at?: number | null;
        breakdown?: Array<{
          interval: string;
          balance?: number;
          usage?: number;
          included_usage?: number;
        }>;
      }
    | null
    | undefined;

  const activeWorkspaceId = data?.owner.ownerId;

  const included = plan.includedCredits;
  const balance = Math.max(0, Number(feature?.balance ?? 0));
  const used = Math.max(0, included - balance);
  const percentage = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;
  const progressStyle = useMemo(() => ({ width: `${Math.max(percentage, 1)}%` }), [percentage]);

  const breakdown = feature?.breakdown ?? [];
  const topUpBalance = Math.max(
    0,
    Number(breakdown.find((item) => item.interval === "one_off")?.balance ?? 0),
  );

  const handleTopUpUsdChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setTopUpUsd(event.target.value);
  }, []);

  const handleManualTopUp = useCallback(async () => {
    const usdAmount = Number(topUpUsd);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      toast.error("Enter a positive USD amount.");
      return;
    }

    try {
      await manualTopUp.mutateAsync({
        ownerType: "workspace",
        workspaceId: activeWorkspaceId ?? undefined,
        usdAmount,
      });
      toast.success(
        `Granted ${formatCredits(Math.floor(usdAmount * TOP_UP_CREDITS_PER_USD))} credits.`,
      );
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to grant top-up.");
    }
  }, [activeWorkspaceId, manualTopUp, refetch, topUpUsd]);

  const topUpCreditsPreview = Math.max(
    0,
    Math.floor(Number(topUpUsd || 0) * TOP_UP_CREDITS_PER_USD),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Usage</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Shared workspace credits from your {plan.name} plan.
        </p>
      </div>

      {/* Subscription usage */}
      <section className="rounded-lg border p-5">
        <div className="flex items-baseline justify-between gap-4">
          <div className="text-sm font-medium">
            {formatCredits(used)} <span className="text-muted-foreground font-normal">of</span>{" "}
            {formatCredits(included)}{" "}
            <span className="text-muted-foreground font-normal">credits used</span>
          </div>
          <div className="text-muted-foreground text-sm tabular-nums">
            {feature?.next_reset_at ? `Resets ${formatDate(feature.next_reset_at * 1000)}` : null}
          </div>
        </div>
        <div className="mt-3">
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-[#B55239] transition-all"
              style={progressStyle}
            />
          </div>
        </div>
      </section>

      {/* Top-up balance + action */}
      <section className="rounded-lg border p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-medium">Top-up balance</h3>
          <div className="text-2xl font-semibold tabular-nums">{formatCredits(topUpBalance)}</div>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Top-ups are valid for 12 months. $1 = {TOP_UP_CREDITS_PER_USD} credits.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <div className="relative max-w-[140px]">
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
          <Button onClick={handleManualTopUp} disabled={manualTopUp.isPending}>
            {manualTopUp.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Add ${formatCredits(topUpCreditsPreview)} credits`
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
