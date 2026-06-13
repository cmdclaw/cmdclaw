import { DEFAULT_CONNECTED_CHATGPT_MODEL } from "@bap/core/lib/chat-model-defaults";
import {
  createCoworkerRunner,
  runChatSession,
  type BapApiClient,
  type CoworkerRunStatus,
} from "@bap/client";

export async function handleChatRun(params: {
  client: BapApiClient;
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

export async function handleCoworkerList(client: BapApiClient) {
  const runner = createCoworkerRunner(client);
  return {
    status: "completed" as const,
    coworkers: await runner.list(),
  };
}

export async function handleCoworkerGet(client: BapApiClient, reference: string) {
  const runner = createCoworkerRunner(client);
  return {
    status: "completed" as const,
    coworker: await runner.get(reference),
  };
}

export async function handleCoworkerCreate(params: {
  client: BapApiClient;
  name?: string;
  trigger?: string;
  prompt?: string;
  promptDo?: string;
  promptDont?: string;
  autoApprove?: boolean;
  model?: string;
  authSource?: "user" | "shared";
  integrations?: string[];
  folderPath?: string;
  files?: Array<{
    filename: string;
    mimeType: string;
    contentBase64: string;
    description?: string;
  }>;
}) {
  const runner = createCoworkerRunner(params.client);
  const allowedIntegrations =
    params.integrations && params.integrations.length > 0 ? params.integrations : undefined;
  const created = await runner.create({
    name: params.name,
    triggerType: params.trigger ?? "manual",
    prompt: params.prompt ?? "",
    promptDo: params.promptDo,
    promptDont: params.promptDont,
    autoApprove: params.autoApprove,
    model: params.model ?? DEFAULT_CONNECTED_CHATGPT_MODEL,
    authSource: params.authSource,
    toolAccessMode: allowedIntegrations ? "selected" : undefined,
    allowedIntegrations,
  });

  const trimmedFolderPath = params.folderPath?.trim();
  const folder = trimmedFolderPath
    ? await params.client.coworkerFolder.createPath({ path: trimmedFolderPath })
    : null;
  if (folder) {
    await params.client.coworkerFolder.moveCoworker({
      coworkerId: created.id,
      folderId: folder.id,
    });
  }

  const documents = params.files?.length
    ? await Promise.all(
        params.files.map((file) =>
          params.client.coworker.uploadDocument({
            coworkerId: created.id,
            filename: file.filename,
            mimeType: file.mimeType,
            content: file.contentBase64,
            description: file.description,
          }),
        ),
      )
    : [];

  return {
    status: "completed" as const,
    coworker: created,
    folder: folder ?? undefined,
    documents,
  };
}

export async function handleCoworkerRun(params: {
  client: BapApiClient;
  reference: string;
  payload?: unknown;
  userInput?: string;
}) {
  const runner = createCoworkerRunner(params.client);
  const trustedUserInput = params.userInput?.trim();
  return {
    status: "completed" as const,
    run: await runner.run(params.reference, params.payload, {
      trustedUserInput:
        trustedUserInput && trustedUserInput.length > 0 ? trustedUserInput : undefined,
    }),
  };
}

export async function handleCoworkerUploadDocument(params: {
  client: BapApiClient;
  reference: string;
  files: Array<{
    filename: string;
    mimeType: string;
    contentBase64: string;
    description?: string;
  }>;
}) {
  const runner = createCoworkerRunner(params.client);
  const coworkerId = await runner.resolveReference(params.reference);
  const documents = await Promise.all(
    params.files.map((file) =>
      params.client.coworker.uploadDocument({
        coworkerId,
        filename: file.filename,
        mimeType: file.mimeType,
        content: file.contentBase64,
        description: file.description,
      }),
    ),
  );

  return {
    status: "completed" as const,
    coworkerId,
    documents,
  };
}

export async function handleCoworkerLogs(client: BapApiClient, runId: string) {
  const runner = createCoworkerRunner(client);
  return {
    status: "completed" as const,
    run: await runner.logs(runId),
  };
}

export async function handleCoworkerRuns(params: {
  client: BapApiClient;
  cursor?: string;
  limit?: number;
  status?: CoworkerRunStatus;
  coworkerId?: string;
}) {
  const result = await params.client.coworker.listWorkspaceRuns({
    cursor: params.cursor,
    limit: params.limit,
    status: params.status,
    coworkerId: params.coworkerId,
  });

  return {
    status: "completed" as const,
    ...result,
  };
}

export async function handleSkillAdd(params: {
  client: BapApiClient;
  files: Array<{
    path: string;
    mimeType?: string;
    contentBase64: string;
  }>;
}) {
  const created = await params.client.skill.import({
    mode: "folder",
    files: params.files,
  });

  return {
    status: "completed" as const,
    skill: created,
  };
}
