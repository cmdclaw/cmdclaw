import { test as base, expect } from "@playwright/test";
import { Sandbox } from "e2b";
import { resolveLiveE2EModel } from "./live-chat-model";
import {
  assertSandboxRowsUseProvider,
  liveSandboxProvider,
  type SandboxProvider,
} from "./live-sandbox";

type LiveFixtures = {
  liveSandboxEnforcement: void;
};
type LiveWorkerFixtures = {
  liveChatModel: string;
  liveSandboxProvider: SandboxProvider;
};

function collectNestedStringFields(payload: unknown, fieldName: string): string[] {
  const values = new Set<string>();
  const stack: unknown[] = [payload];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (key === fieldName && typeof value === "string" && value.trim().length > 0) {
        values.add(value);
      }
      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return Array.from(values);
}

async function killSandboxById(sandboxId: string): Promise<void> {
  const sandboxApi = Sandbox as unknown as {
    kill?: (id: string) => Promise<void>;
    connect?: (id: string) => Promise<{ kill: () => Promise<void> }>;
  };

  if (sandboxApi.kill) {
    await sandboxApi.kill(sandboxId);
    return;
  }

  if (sandboxApi.connect) {
    const sandbox = await sandboxApi.connect(sandboxId);
    await sandbox.kill();
  }
}

export const test = base.extend<LiveFixtures, LiveWorkerFixtures>({
  liveChatModel: [
    async ({}, provideModel) => {
      const model = await resolveLiveE2EModel();
      await provideModel(model);
    },
    { scope: "worker" },
  ],
  liveSandboxProvider: [
    async ({}, provideSandboxProvider) => {
      await provideSandboxProvider(liveSandboxProvider);
    },
    { scope: "worker" },
  ],
  liveSandboxEnforcement: [
    async ({ page, liveSandboxProvider }, provideCleanup) => {
      const conversationIds = new Set<string>();
      const generationIds = new Set<string>();
      const startGenerationRoute = async (route: {
        continue: (overrides?: {
          headers?: Record<string, string>;
          postData?: string;
        }) => Promise<void>;
        request: () => {
          method: () => string;
          postData: () => string | null;
          headers: () => Record<string, string>;
        };
      }) => {
        const request = route.request();
        if (request.method() !== "POST") {
          await route.continue();
          return;
        }

        const rawBody = request.postData();
        if (!rawBody) {
          await route.continue();
          return;
        }

        try {
          const parsed = JSON.parse(rawBody) as Record<string, unknown>;
          const body = { ...parsed, sandboxProvider: liveSandboxProvider };
          const headers: Record<string, string> = {
            ...request.headers(),
            "content-type": "application/json",
          };
          delete headers["content-length"];
          await route.continue({
            headers,
            postData: JSON.stringify(body),
          });
        } catch {
          await route.continue();
        }
      };
      const onResponse = (response: {
        url: () => string;
        request: () => { method: () => string };
        json: () => Promise<unknown>;
      }) => {
        if (!response.url().includes("startGeneration")) {
          return;
        }
        if (response.request().method() !== "POST") {
          return;
        }
        response
          .json()
          .then((payload) => {
            for (const id of collectNestedStringFields(payload, "conversationId")) {
              conversationIds.add(id);
            }
            for (const id of collectNestedStringFields(payload, "generationId")) {
              generationIds.add(id);
            }
          })
          .catch(() => {});
      };

      await page.route("**/*startGeneration*", startGenerationRoute);
      page.on("response", onResponse);
      await provideCleanup();
      await page.unroute("**/*startGeneration*", startGenerationRoute);
      page.off("response", onResponse);

      if (conversationIds.size === 0 && generationIds.size === 0) {
        return;
      }

      const rows = await assertSandboxRowsUseProvider({
        generationIds,
        conversationIds,
        expectedProvider: liveSandboxProvider,
      });

      if (liveSandboxProvider !== "e2b" || !process.env.E2B_API_KEY) {
        return;
      }

      const sandboxIds = Array.from(
        new Set(
          rows
            .map((row) => row.sandboxId)
            .filter((sandboxId): sandboxId is string => Boolean(sandboxId)),
        ),
      );

      if (sandboxIds.length === 0) {
        console.warn(
          `[live-e2e] no sandbox IDs found for cleanup (generationIds=${generationIds.size}, conversationIds=${conversationIds.size})`,
        );
        return;
      }

      await Promise.allSettled(
        sandboxIds.map(async (sandboxId) => {
          try {
            await killSandboxById(sandboxId);
            console.log(`[live-e2e] killed sandbox ${sandboxId}`);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[live-e2e] failed to kill sandbox ${sandboxId}: ${msg}`);
          }
        }),
      );
    },
    { auto: true },
  ],
});

export { expect };
