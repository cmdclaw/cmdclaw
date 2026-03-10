import {
  BILLING_CREDIT_FEATURE_ID,
  BILLING_ORG_SUPPORT_FEATURE_ID,
  BILLING_PLANS,
  BILLING_SANDBOX_FEATURE_ID,
} from "@cmdclaw/core/lib/billing-plans";
import { feature, featureItem, priceItem, product } from "atmn";

export const llmCredits = feature({
  id: BILLING_CREDIT_FEATURE_ID,
  name: "LLM Credits",
  type: "single_use",
});

export const orgSupport = feature({
  id: BILLING_ORG_SUPPORT_FEATURE_ID,
  name: "Organization Support",
  type: "boolean",
});

export const cloudSandbox = feature({
  id: BILLING_SANDBOX_FEATURE_ID,
  name: "Cloud Sandbox",
  type: "boolean",
});

export const free = product({
  id: BILLING_PLANS.free.id,
  name: BILLING_PLANS.free.name,
  is_default: true,
  items: [],
});

export const pro = product({
  id: BILLING_PLANS.pro.id,
  name: BILLING_PLANS.pro.name,
  items: [
    featureItem({
      feature_id: llmCredits.id,
      included_usage: BILLING_PLANS.pro.includedCredits,
      interval: "month",
    }),
    featureItem({ feature_id: cloudSandbox.id }),
    priceItem({ price: BILLING_PLANS.pro.monthlyPriceUsd ?? 0, interval: "month" }),
  ],
});

export const business = product({
  id: BILLING_PLANS.business.id,
  name: BILLING_PLANS.business.name,
  items: [
    featureItem({
      feature_id: llmCredits.id,
      included_usage: BILLING_PLANS.business.includedCredits,
      interval: "month",
    }),
    featureItem({ feature_id: orgSupport.id }),
    featureItem({ feature_id: cloudSandbox.id }),
    priceItem({ price: BILLING_PLANS.business.monthlyPriceUsd ?? 0, interval: "month" }),
  ],
});

// Autumn's current typed config surface does not expose rollover metadata,
// so the app stores rollover policy in checked-in plan metadata and the UI.
export const enterprise = product({
  id: BILLING_PLANS.enterprise.id,
  name: BILLING_PLANS.enterprise.name,
  items: [featureItem({ feature_id: orgSupport.id }), featureItem({ feature_id: cloudSandbox.id })],
});
