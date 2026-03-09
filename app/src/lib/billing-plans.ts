export const BILLING_PLAN_IDS = ["free", "pro", "business", "enterprise"] as const;

export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];

export type BillingOwnerType = "user" | "workspace";

export type BillingPlanDefinition = {
  id: BillingPlanId;
  name: string;
  description: string;
  monthlyPriceUsd: number | null;
  monthlyPriceLabel: string;
  includedCredits: number;
  rolloverMonths: number;
  ownerType: BillingOwnerType;
  orgSupport: boolean;
  contactSales: boolean;
  ctaLabel: string;
};

export const BILLING_PLANS: Record<BillingPlanId, BillingPlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    description: "Explore CmdClaw with manual top-ups and no included credits.",
    monthlyPriceUsd: 0,
    monthlyPriceLabel: "$0",
    includedCredits: 0,
    rolloverMonths: 0,
    ownerType: "user",
    orgSupport: false,
    contactSales: false,
    ctaLabel: "Start free",
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Individual plan with a monthly included credit budget.",
    monthlyPriceUsd: 25,
    monthlyPriceLabel: "$25",
    includedCredits: 2500,
    rolloverMonths: 1,
    ownerType: "user",
    orgSupport: false,
    contactSales: false,
    ctaLabel: "Upgrade to Pro",
  },
  business: {
    id: "business",
    name: "Business",
    description: "Flat org plan with shared credits across the workspace.",
    monthlyPriceUsd: 50,
    monthlyPriceLabel: "$50",
    includedCredits: 5000,
    rolloverMonths: 3,
    ownerType: "workspace",
    orgSupport: true,
    contactSales: false,
    ctaLabel: "Start Business",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "Contact-led org plan with long rollover and manual provisioning.",
    monthlyPriceUsd: null,
    monthlyPriceLabel: "Contact us",
    includedCredits: 0,
    rolloverMonths: 12,
    ownerType: "workspace",
    orgSupport: true,
    contactSales: true,
    ctaLabel: "Contact sales",
  },
};

export const BILLING_CREDIT_FEATURE_ID = "llm_credits";
export const BILLING_ORG_SUPPORT_FEATURE_ID = "org_support";
export const BILLING_SANDBOX_FEATURE_ID = "cloud_sandbox";

export const TOP_UP_CREDITS_PER_USD = 100;
export const TOP_UP_EXPIRY_MONTHS = 12;

export const BILLING_SCOPE_IDS = {
  user: "user",
  workspace: "workspace",
} as const;

type ModelCreditRate = {
  inputPer1kTokens: number;
  outputPer1kTokens: number;
};

const DEFAULT_MODEL_CREDIT_RATE: ModelCreditRate = {
  inputPer1kTokens: 2,
  outputPer1kTokens: 8,
};

export const MODEL_CREDIT_RATES: Record<string, ModelCreditRate> = {
  "anthropic/claude-sonnet-4-6": { inputPer1kTokens: 3, outputPer1kTokens: 12 },
  "anthropic/claude-opus-4-1": { inputPer1kTokens: 8, outputPer1kTokens: 32 },
  "openai/gpt-4.1": { inputPer1kTokens: 4, outputPer1kTokens: 16 },
  "openai/gpt-4.1-mini": { inputPer1kTokens: 1, outputPer1kTokens: 4 },
  "openai/gpt-5": { inputPer1kTokens: 6, outputPer1kTokens: 24 },
  "openai/gpt-5-mini": { inputPer1kTokens: 2, outputPer1kTokens: 8 },
  "google/gemini-2.5-pro": { inputPer1kTokens: 4, outputPer1kTokens: 16 },
  "google/gemini-2.5-flash": { inputPer1kTokens: 1, outputPer1kTokens: 4 },
};

export function getModelCreditRate(modelId: string): ModelCreditRate {
  return MODEL_CREDIT_RATES[modelId] ?? DEFAULT_MODEL_CREDIT_RATE;
}

export const SANDBOX_CREDITS_PER_MINUTE = 15;

export function formatCredits(value: number): string {
  return value.toLocaleString();
}
