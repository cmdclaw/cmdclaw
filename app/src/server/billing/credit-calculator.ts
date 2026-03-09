import { SANDBOX_CREDITS_PER_MINUTE, getModelCreditRate } from "@/lib/billing-plans";

export type CreditCalculationInput = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  sandboxRuntimeMs: number;
};

export type CreditCalculationResult = {
  credits: number;
  tokenCredits: number;
  sandboxCredits: number;
};

export function calculateCredits(input: CreditCalculationInput): CreditCalculationResult {
  const rate = getModelCreditRate(input.model);
  const tokenCredits =
    (Math.max(0, input.inputTokens) / 1000) * rate.inputPer1kTokens +
    (Math.max(0, input.outputTokens) / 1000) * rate.outputPer1kTokens;
  const sandboxCredits =
    (Math.max(0, input.sandboxRuntimeMs) / 60_000) * SANDBOX_CREDITS_PER_MINUTE;
  const credits = Math.max(0, Math.ceil(tokenCredits + sandboxCredits));

  return {
    credits,
    tokenCredits: Math.ceil(tokenCredits),
    sandboxCredits: Math.ceil(sandboxCredits),
  };
}
