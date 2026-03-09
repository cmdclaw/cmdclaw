import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/env";

export type CoworkerNameContext = {
  agentDescription: string;
  triggerType: string;
  allowedIntegrations: string[];
  allowedCustomIntegrations: string[];
  schedule: unknown;
  autoApprove: boolean;
  promptDo?: string | null;
  promptDont?: string | null;
};

function normalizeCoworkerName(text: string): string | null {
  const firstLine = text.split("\n")[0] ?? "";
  const cleaned = firstLine
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.:;!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }
  return cleaned.slice(0, 128);
}

export async function generateCoworkerName(context: CoworkerNameContext): Promise<string | null> {
  try {
    if (!env.GEMINI_API_KEY) {
      console.warn("[CoworkerName] No GEMINI_API_KEY, skipping coworker name generation");
      return null;
    }

    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const coworkerContextJson = JSON.stringify(
      {
        triggerType: context.triggerType,
        allowedIntegrations: context.allowedIntegrations,
        allowedCustomIntegrations: context.allowedCustomIntegrations,
        schedule: context.schedule,
        autoApprove: context.autoApprove,
        promptDo: context.promptDo ?? null,
        promptDont: context.promptDont ?? null,
      },
      null,
      2,
    );

    const prompt = [
      "Generate a concise coworker name (3-7 words).",
      "Return ONLY the name text, no quotes, markdown, numbering, or explanation.",
      "",
      "Agent description:",
      context.agentDescription.slice(0, 4000),
      "",
      "Coworker context JSON:",
      coworkerContextJson,
    ].join("\n");

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    if (!text) {
      return null;
    }
    return normalizeCoworkerName(text);
  } catch (error) {
    console.error("[CoworkerName] Error generating coworker name:", error);
    return null;
  }
}
