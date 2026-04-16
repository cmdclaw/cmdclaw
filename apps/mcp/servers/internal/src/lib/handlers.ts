import { createCoworkerRunner, runChatSession, type CmdclawApiClient } from "@cmdclaw/client";

export async function handleChatRun(params: {
  client: CmdclawApiClient;
  message: string;
  conversationId?: string;
  model?: string;
  authSource?: "user" | "shared";
  sandbox?: "e2b" | "daytona" | "docker";
  autoApprove?: boolean;
}) {
  const result = await runChatSession({
    client: params.client,
    input: {
      content: params.message,
      conversationId: params.conversationId,
      model: params.model,
      authSource: params.authSource,
      sandboxProvider: params.sandbox,
      autoApprove: params.autoApprove,
    },
  });

  return result;
}

export async function handleCoworkerList(client: CmdclawApiClient) {
  const runner = createCoworkerRunner(client);
  return {
    status: "completed" as const,
    coworkers: await runner.list(),
  };
}

export async function handleCoworkerGet(client: CmdclawApiClient, reference: string) {
  const runner = createCoworkerRunner(client);
  return {
    status: "completed" as const,
    coworker: await runner.get(reference),
  };
}

export async function handleCoworkerRun(params: {
  client: CmdclawApiClient;
  reference: string;
  payload?: unknown;
}) {
  const runner = createCoworkerRunner(params.client);
  return {
    status: "completed" as const,
    run: await runner.run(params.reference, params.payload),
  };
}

export async function handleCoworkerLogs(client: CmdclawApiClient, runId: string) {
  const runner = createCoworkerRunner(client);
  return {
    status: "completed" as const,
    run: await runner.logs(runId),
  };
}
