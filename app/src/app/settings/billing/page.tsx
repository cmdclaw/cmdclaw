"use client";

import type { ChangeEvent, MouseEvent } from "react";
import { Check, ExternalLink, Loader2, Sparkles, Zap } from "lucide-react";
import { Fragment, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BILLING_PLANS, TOP_UP_CREDITS_PER_USD, formatCredits } from "@/lib/billing-plans";
import {
  useAttachBillingPlan,
  useBillingOverview,
  useCancelBillingPlan,
  useCreateWorkspace,
  useCurrentUser,
  useManualBillingTopUp,
  useOpenBillingPortal,
  useSwitchWorkspace,
} from "@/orpc/hooks";

const TOP_UP_PRESETS = [10, 25, 50, 100];
const EMPTY_WORKSPACE_OPTIONS: Array<{ id: string; name: string }> = [];

export default function BillingPage() {
  const { data: overview, isLoading, refetch } = useBillingOverview();
  const { data: currentUser } = useCurrentUser();
  const attachPlan = useAttachBillingPlan();
  const openPortal = useOpenBillingPortal();
  const cancelPlan = useCancelBillingPlan();
  const manualTopUp = useManualBillingTopUp();
  const createWorkspace = useCreateWorkspace();
  const switchWorkspace = useSwitchWorkspace();

  const [topUpUsd, setTopUpUsd] = useState("25");
  const [workspaceName, setWorkspaceName] = useState("");
  const [pendingWorkspacePlanId, setPendingWorkspacePlanId] = useState<
    "business" | "enterprise" | null
  >(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    currentUser?.activeWorkspaceId ?? null,
  );

  const activeWorkspaceId =
    overview?.owner.ownerType === "workspace"
      ? overview.owner.ownerId
      : currentUser?.activeWorkspaceId;
  const ownerType = overview?.owner.ownerType ?? "user";
  const currentPlan = overview?.plan ?? BILLING_PLANS.free;
  const workspaceOptions = overview?.workspaces ?? EMPTY_WORKSPACE_OPTIONS;
  const availableTargetPlans = useMemo(() => {
    return Object.values(BILLING_PLANS);
  }, []);

  const feature = overview?.feature as
    | {
        balance?: number | null;
        included_usage?: number;
        next_reset_at?: number | null;
        rollovers?: { balance: number; expires_at: number };
      }
    | null
    | undefined;

  const handleAttachPlan = useCallback(
    async (
      planId: "free" | "pro" | "business" | "enterprise",
      options?: { ownerType?: "user" | "workspace"; workspaceId?: string },
    ) => {
      try {
        const targetOwnerType = options?.ownerType ?? ownerType;
        const result = await attachPlan.mutateAsync({
          ownerType: targetOwnerType,
          workspaceId:
            targetOwnerType === "workspace"
              ? (options?.workspaceId ?? activeWorkspaceId ?? undefined)
              : undefined,
          planId,
          successUrl:
            typeof window !== "undefined"
              ? `${window.location.origin}/settings/billing`
              : undefined,
        });
        if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
          return;
        }
        toast.success(`Plan updated to ${BILLING_PLANS[planId].name}.`);
        setPendingWorkspacePlanId(null);
        await refetch();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update plan.");
      }
    },
    [activeWorkspaceId, attachPlan, ownerType, refetch],
  );

  const handleOpenPortal = useCallback(async () => {
    try {
      const result = await openPortal.mutateAsync({
        ownerType,
        workspaceId: ownerType === "workspace" ? (activeWorkspaceId ?? undefined) : undefined,
        returnUrl:
          typeof window !== "undefined" ? `${window.location.origin}/settings/billing` : undefined,
      });
      window.location.href = result.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open billing portal.");
    }
  }, [activeWorkspaceId, openPortal, ownerType]);

  const handleCancel = useCallback(async () => {
    try {
      await cancelPlan.mutateAsync({
        ownerType,
        workspaceId: ownerType === "workspace" ? (activeWorkspaceId ?? undefined) : undefined,
        productId:
          currentPlan.id === "business" || currentPlan.id === "enterprise" ? currentPlan.id : "pro",
      });
      toast.success("Cancellation requested.");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel plan.");
    }
  }, [activeWorkspaceId, cancelPlan, currentPlan.id, ownerType, refetch]);

  const handleManualTopUp = useCallback(async () => {
    const usdAmount = Number(topUpUsd);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      toast.error("Enter a positive USD amount.");
      return;
    }

    try {
      await manualTopUp.mutateAsync({
        ownerType,
        workspaceId: ownerType === "workspace" ? (activeWorkspaceId ?? undefined) : undefined,
        usdAmount,
      });
      toast.success(
        `Added ${formatCredits(Math.floor(usdAmount * TOP_UP_CREDITS_PER_USD))} credits.`,
      );
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add credits.");
    }
  }, [activeWorkspaceId, manualTopUp, ownerType, refetch, topUpUsd]);

  const handleTopUpUsdChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setTopUpUsd(event.target.value);
  }, []);

  const handleWorkspaceNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setWorkspaceName(event.target.value);
  }, []);

  const handleCreateWorkspace = useCallback(async () => {
    const name = workspaceName.trim();
    if (name.length < 2) {
      toast.error("Workspace name must be at least 2 characters.");
      return;
    }

    try {
      const created = await createWorkspace.mutateAsync({ name });
      await switchWorkspace.mutateAsync(created.id);
      setWorkspaceName("");
      if (pendingWorkspacePlanId) {
        await handleAttachPlan(pendingWorkspacePlanId, {
          ownerType: "workspace",
          workspaceId: created.id,
        });
        return;
      }
      toast.success("Workspace created. You can now subscribe to a Business plan.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create workspace.");
    }
  }, [createWorkspace, handleAttachPlan, pendingWorkspacePlanId, switchWorkspace, workspaceName]);

  const handlePlanButtonClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const planId = event.currentTarget.dataset.planId as
        | "free"
        | "pro"
        | "business"
        | "enterprise"
        | undefined;
      if (!planId) {
        return;
      }
      const plan = BILLING_PLANS[planId];
      if (plan.ownerType === "workspace") {
        if (workspaceOptions.length > 0) {
          setSelectedWorkspaceId(activeWorkspaceId ?? workspaceOptions[0]?.id ?? null);
        }
      }
      if (plan.ownerType === "workspace" && !activeWorkspaceId) {
        setPendingWorkspacePlanId(planId as "business" | "enterprise");
        toast.message(
          workspaceOptions.length > 0
            ? "Choose a workspace or create a new one to continue."
            : "Create a workspace to continue with a Business plan.",
        );
        return;
      }
      void handleAttachPlan(planId);
    },
    [activeWorkspaceId, handleAttachPlan, workspaceOptions],
  );

  const handleUseWorkspace = useCallback(async () => {
    if (!selectedWorkspaceId || !pendingWorkspacePlanId) {
      return;
    }

    try {
      await switchWorkspace.mutateAsync(selectedWorkspaceId);
      await handleAttachPlan(pendingWorkspacePlanId, {
        ownerType: "workspace",
        workspaceId: selectedWorkspaceId,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to continue with workspace.");
    }
  }, [handleAttachPlan, pendingWorkspacePlanId, selectedWorkspaceId, switchWorkspace]);

  const handleTopUpPresetClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    setTopUpUsd(event.currentTarget.dataset.amount ?? "25");
  }, []);

  const topUpCredits = Math.max(0, Math.floor(Number(topUpUsd || 0) * TOP_UP_CREDITS_PER_USD));
  const balance = Math.max(0, Number(feature?.balance ?? 0));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Billing</h2>
          <p className="text-muted-foreground mt-1 text-sm">Manage your plan and credits.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenPortal}
          disabled={openPortal.isPending}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Billing portal
        </Button>
      </div>

      {/* Plan cards */}
      <section>
        {ownerType === "workspace" && activeWorkspaceId ? (
          <div className="text-muted-foreground mb-4 rounded-lg border px-3 py-2 text-[13px]">
            Managing workspace billing for{" "}
            <span className="text-foreground font-medium">
              {workspaceOptions.find((workspace) => workspace.id === activeWorkspaceId)?.name ??
                "workspace"}
            </span>
          </div>
        ) : null}

        {pendingWorkspacePlanId ? (
          <div className="bg-accent/40 mb-4 rounded-lg border p-3">
            <div className="mb-3 space-y-1">
              <div className="text-sm font-medium">
                {`Set up a workspace to start ${BILLING_PLANS[pendingWorkspacePlanId].name}`}
              </div>
              <p className="text-muted-foreground text-[13px]">
                Choose an existing workspace or create a new one. You can invite teammates and
                manage roles later.
              </p>
            </div>

            {workspaceOptions.length > 0 ? (
              <div className="mb-2 flex flex-col gap-2 sm:flex-row">
                <Select value={selectedWorkspaceId ?? ""} onValueChange={setSelectedWorkspaceId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Choose workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaceOptions.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUseWorkspace}
                  disabled={
                    switchWorkspace.isPending || attachPlan.isPending || !selectedWorkspaceId
                  }
                >
                  Use workspace
                </Button>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={workspaceName}
                onChange={handleWorkspaceNameChange}
                placeholder="New workspace name"
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handleCreateWorkspace}
                disabled={createWorkspace.isPending}
              >
                Continue with Business
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium">Choose a plan</h3>
          {currentPlan.id !== "free" && currentPlan.id !== "enterprise" && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelPlan.isPending}
              className="text-muted-foreground hover:text-destructive text-xs underline-offset-4 transition-colors hover:underline disabled:opacity-50"
            >
              Cancel plan
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {availableTargetPlans.map((plan, index) => {
            const isCurrent = plan.id === currentPlan.id && plan.ownerType === ownerType;
            const requiresWorkspaceSetup = plan.ownerType === "workspace" && !activeWorkspaceId;
            const buttonLabel = requiresWorkspaceSetup
              ? plan.id === "enterprise"
                ? "Set up workspace"
                : "Create workspace to continue"
              : isCurrent
                ? "Current plan"
                : plan.ctaLabel;
            return (
              <Fragment key={plan.id}>
                {index === 2 && (
                  <div className="text-muted-foreground col-span-full mt-3 mb-1 flex items-center gap-2 text-xs">
                    <div className="bg-border h-px flex-1" />
                    <span>Team plans</span>
                    <div className="bg-border h-px flex-1" />
                  </div>
                )}
                <div
                  className={`relative rounded-xl border p-5 transition-all ${
                    isCurrent
                      ? "border-foreground/20 bg-accent/50 ring-foreground/5 ring-1"
                      : "hover:border-foreground/15 border-border"
                  }`}
                >
                  {isCurrent && (
                    <div className="bg-foreground text-background absolute -top-2.5 right-4 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                      <Check className="h-3 w-3" />
                      Current
                    </div>
                  )}

                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium">{plan.name}</h4>
                      <div className="mt-1.5 flex items-baseline gap-1">
                        <span className="text-2xl font-semibold tracking-tight">
                          {plan.monthlyPriceLabel}
                        </span>
                        {plan.monthlyPriceUsd !== null && plan.monthlyPriceUsd > 0 && (
                          <span className="text-muted-foreground text-xs">/mo</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-muted-foreground mt-3 text-[13px] leading-relaxed">
                    {plan.description}
                  </p>

                  {requiresWorkspaceSetup && (
                    <p className="text-muted-foreground mt-2 text-[12px] leading-relaxed">
                      Requires a workspace before checkout. You can invite teammates after setup.
                    </p>
                  )}

                  <div className="mt-4 space-y-2 text-[13px]">
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span>
                        {plan.includedCredits > 0
                          ? `${formatCredits(plan.includedCredits)} credits/mo`
                          : "No included credits"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span>
                        {plan.rolloverMonths === 0
                          ? "No rollover"
                          : `${plan.rolloverMonths}-month rollover`}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5">
                    {plan.contactSales ? (
                      <Button asChild variant="outline" className="w-full" size="sm">
                        <a href="mailto:hello@cmdclaw.ai?subject=CmdClaw%20Enterprise">
                          Contact sales
                        </a>
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        size="sm"
                        variant={isCurrent ? "outline" : "default"}
                        disabled={attachPlan.isPending || isCurrent}
                        data-plan-id={plan.id}
                        onClick={handlePlanButtonClick}
                      >
                        {buttonLabel}
                      </Button>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </section>

      {/* Credits balance + Top-up */}
      <section className="rounded-xl border p-5">
        <h3 className="text-sm font-medium">Credits</h3>
        <p className="text-muted-foreground mt-1 text-[13px]">
          Your credit pool is used for all AI interactions. Plan credits refresh monthly, top-ups
          expire after 12 months.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-900">
            <div className="text-muted-foreground text-xs">Top-up balance</div>
            <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
              {formatCredits(balance)}
            </div>
          </div>
          <div className="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-900">
            <div className="text-muted-foreground text-xs">Included monthly</div>
            <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
              {formatCredits(currentPlan.includedCredits)}
            </div>
          </div>
          <div className="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-900">
            <div className="text-muted-foreground text-xs">Next reset</div>
            <div className="mt-1.5 text-lg font-semibold">
              {feature?.next_reset_at
                ? new Date(feature.next_reset_at * 1000).toLocaleDateString()
                : "Not scheduled"}
            </div>
          </div>
        </div>

        <div className="bg-accent/40 mt-4 rounded-lg p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium">Top up</div>
              <p className="text-muted-foreground mt-0.5 text-[13px]">
                $1 = {TOP_UP_CREDITS_PER_USD} credits, added instantly.
              </p>
            </div>

            <div className="flex w-full max-w-sm flex-col gap-2.5">
              <div className="flex gap-1.5">
                {TOP_UP_PRESETS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    data-amount={String(amount)}
                    onClick={handleTopUpPresetClick}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium tabular-nums transition-colors ${
                      topUpUsd === String(amount)
                        ? "border-foreground/20 bg-background text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/60 border-transparent"
                    }`}
                  >
                    ${amount}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                    $
                  </span>
                  <Input
                    value={topUpUsd}
                    onChange={handleTopUpUsdChange}
                    className="pl-7 tabular-nums"
                    type="number"
                    min="1"
                    step="1"
                  />
                </div>
                <Button
                  onClick={handleManualTopUp}
                  disabled={manualTopUp.isPending}
                  className="shrink-0"
                >
                  Add {formatCredits(topUpCredits)} credits
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
