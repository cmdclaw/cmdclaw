import { createHash } from "node:crypto";
import { db } from "@cmdclaw/db/client";
import {
  workspaceExecutorPackage,
  workspaceExecutorSource,
  workspaceExecutorSourceCredential,
} from "@cmdclaw/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { decrypt, encrypt } from "../utils/encryption";

type DatabaseLike = typeof db;

export type ExecutorSourceKind = "mcp" | "openapi";
export type ExecutorSourceAuthType = "none" | "api_key" | "bearer";

export type WorkspaceExecutorSourceRecord = typeof workspaceExecutorSource.$inferSelect;
export type WorkspaceExecutorSourceCredentialRecord =
  typeof workspaceExecutorSourceCredential.$inferSelect;
export type WorkspaceExecutorPackageRecord = typeof workspaceExecutorPackage.$inferSelect;

type LocalExecutorConfigSource = Record<string, unknown> & {
  kind: ExecutorSourceKind;
  name?: string;
  namespace?: string;
  enabled?: boolean;
  connection: Record<string, unknown> & {
    endpoint: string;
    auth?: string;
  };
  binding: Record<string, unknown>;
};

type LocalExecutorConfig = {
  workspace?: {
    name?: string;
  };
  sources: Record<string, LocalExecutorConfigSource>;
};

type LocalWorkspaceState = {
  version: 1;
  sources: Record<
    string,
    {
      status: "draft" | "probing" | "auth_required" | "connected" | "error";
      lastError: string | null;
      sourceHash: string | null;
      createdAt: number;
      updatedAt: number;
    }
  >;
  policies: Record<string, never>;
};

export function normalizeExecutorNamespace(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.length === 0) {
    throw new Error("Namespace must contain letters or numbers.");
  }

  return normalized;
}

export function computeWorkspaceExecutorSourceRevisionHash(input: {
  kind: ExecutorSourceKind;
  name: string;
  namespace: string;
  endpoint: string;
  specUrl: string | null;
  transport: string | null;
  headers: Record<string, string> | null | undefined;
  queryParams: Record<string, string> | null | undefined;
  defaultHeaders: Record<string, string> | null | undefined;
  authType: ExecutorSourceAuthType;
  authHeaderName: string | null;
  authQueryParam: string | null;
  authPrefix: string | null;
  enabled: boolean;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        kind: input.kind,
        name: input.name.trim(),
        namespace: normalizeExecutorNamespace(input.namespace),
        endpoint: input.endpoint.trim(),
        specUrl: input.specUrl?.trim() || null,
        transport: input.transport?.trim() || null,
        headers: input.headers ?? null,
        queryParams: input.queryParams ?? null,
        defaultHeaders: input.defaultHeaders ?? null,
        authType: input.authType,
        authHeaderName: input.authHeaderName?.trim() || null,
        authQueryParam: input.authQueryParam?.trim() || null,
        authPrefix: input.authPrefix ?? null,
        enabled: input.enabled,
      }),
    )
    .digest("hex");
}

function buildBaseSourceConfig(source: WorkspaceExecutorSourceRecord): LocalExecutorConfigSource {
  if (source.kind === "openapi") {
    return {
      kind: "openapi",
      name: source.name,
      namespace: source.namespace,
      enabled: source.enabled,
      connection: {
        endpoint: source.endpoint,
      },
      binding: {
        specUrl: source.specUrl,
        defaultHeaders: source.defaultHeaders ?? null,
      },
    };
  }

  return {
    kind: "mcp",
    name: source.name,
    namespace: source.namespace,
    enabled: source.enabled,
    connection: {
      endpoint: source.endpoint,
    },
    binding: {
      transport: source.transport ?? null,
      queryParams: source.queryParams ?? null,
      headers: source.headers ?? null,
    },
  };
}

function buildWorkspaceState(
  sources: WorkspaceExecutorSourceRecord[],
  now = Date.now(),
): LocalWorkspaceState {
  return {
    version: 1,
    sources: Object.fromEntries(
      sources.map((source) => [
        source.id,
        {
          status: "connected",
          lastError: null,
          sourceHash: source.revisionHash,
          createdAt: source.createdAt?.getTime() ?? now,
          updatedAt: source.updatedAt?.getTime() ?? now,
        },
      ]),
    ),
    policies: {},
  };
}

function mergeAuthIntoSourceConfig(input: {
  source: WorkspaceExecutorSourceRecord;
  credential: WorkspaceExecutorSourceCredentialRecord | null | undefined;
  config: LocalExecutorConfigSource;
}): LocalExecutorConfigSource {
  const next = JSON.parse(JSON.stringify(input.config)) as LocalExecutorConfigSource;
  const secret = input.credential?.secret ? decrypt(input.credential.secret) : null;

  if (
    input.source.authType === "none" ||
    !input.credential?.enabled ||
    !secret ||
    secret.trim().length === 0
  ) {
    return next;
  }

  if (input.source.kind === "openapi") {
    const binding = (next.binding ?? {}) as Record<string, unknown>;
    const defaultHeaders = {
      ...((binding.defaultHeaders as Record<string, string> | null | undefined) ?? {}),
    };

    if (input.source.authType === "bearer") {
      defaultHeaders[input.source.authHeaderName?.trim() || "Authorization"] =
        `${input.source.authPrefix ?? "Bearer "}${secret}`;
    } else {
      defaultHeaders[input.source.authHeaderName?.trim() || "X-API-Key"] = secret;
    }

    binding.defaultHeaders = defaultHeaders;
    next.binding = binding;
    return next;
  }

  const binding = (next.binding ?? {}) as Record<string, unknown>;
  const headers = {
    ...((binding.headers as Record<string, string> | null | undefined) ?? {}),
  };
  const queryParams = {
    ...((binding.queryParams as Record<string, string> | null | undefined) ?? {}),
  };

  if (input.source.authType === "bearer") {
    headers[input.source.authHeaderName?.trim() || "Authorization"] =
      `${input.source.authPrefix ?? "Bearer "}${secret}`;
  } else if (input.source.authQueryParam?.trim()) {
    queryParams[input.source.authQueryParam.trim()] = secret;
  } else {
    headers[input.source.authHeaderName?.trim() || "X-API-Key"] = secret;
  }

  binding.headers = headers;
  binding.queryParams = queryParams;
  next.binding = binding;
  return next;
}

export async function listWorkspaceExecutorSources(input: {
  database?: DatabaseLike;
  workspaceId: string;
  userId?: string;
}) {
  const database = input.database ?? db;
  const [sources, credentials] = await Promise.all([
    database.query.workspaceExecutorSource.findMany({
      where: eq(workspaceExecutorSource.workspaceId, input.workspaceId),
      orderBy: (source, { asc }) => [asc(source.name), asc(source.createdAt)],
    }),
    input.userId
      ? database.query.workspaceExecutorSourceCredential.findMany({
          where: eq(workspaceExecutorSourceCredential.userId, input.userId),
        })
      : Promise.resolve([] as WorkspaceExecutorSourceCredentialRecord[]),
  ]);

  const credentialBySourceId = new Map(
    credentials.map((credential) => [credential.workspaceExecutorSourceId, credential]),
  );

  return sources.map((source) => {
    const credential = credentialBySourceId.get(source.id);
    return {
      ...source,
      connected: Boolean(credential?.secret),
      credentialEnabled: credential?.enabled ?? false,
      credentialDisplayName: credential?.displayName ?? null,
      credentialUpdatedAt: credential?.updatedAt ?? null,
    };
  });
}

export async function rebuildWorkspaceExecutorPackage(input: {
  database?: DatabaseLike;
  workspaceId: string;
  workspaceName?: string | null;
}) {
  const database = input.database ?? db;
  const sources = await database.query.workspaceExecutorSource.findMany({
    where: eq(workspaceExecutorSource.workspaceId, input.workspaceId),
    orderBy: (source, { asc }) => [asc(source.namespace), asc(source.createdAt)],
  });

  const revisionHash = createHash("sha256")
    .update(
      JSON.stringify(
        sources.map((source) => ({
          id: source.id,
          revisionHash: source.revisionHash,
          enabled: source.enabled,
          updatedAt: source.updatedAt?.toISOString() ?? null,
        })),
      ),
    )
    .digest("hex");

  const config: LocalExecutorConfig = {
    workspace: input.workspaceName?.trim() ? { name: input.workspaceName.trim() } : undefined,
    sources: Object.fromEntries(
      sources.map((source) => [source.id, buildBaseSourceConfig(source)]),
    ),
  };
  const workspaceState = buildWorkspaceState(sources);

  const payload = {
    revisionHash,
    configJson: `${JSON.stringify(config, null, 2)}\n`,
    workspaceStateJson: `${JSON.stringify(workspaceState, null, 2)}\n`,
  };

  await database
    .insert(workspaceExecutorPackage)
    .values({
      workspaceId: input.workspaceId,
      revisionHash: payload.revisionHash,
      configJson: payload.configJson,
      workspaceStateJson: payload.workspaceStateJson,
      builtAt: new Date(),
    })
    .onConflictDoUpdate({
      target: workspaceExecutorPackage.workspaceId,
      set: {
        revisionHash: payload.revisionHash,
        configJson: payload.configJson,
        workspaceStateJson: payload.workspaceStateJson,
        builtAt: new Date(),
        updatedAt: new Date(),
      },
    });

  return payload;
}

export async function ensureWorkspaceExecutorPackage(input: {
  database?: DatabaseLike;
  workspaceId: string;
  workspaceName?: string | null;
}) {
  const database = input.database ?? db;
  const existing = await database.query.workspaceExecutorPackage.findFirst({
    where: eq(workspaceExecutorPackage.workspaceId, input.workspaceId),
  });

  if (existing) {
    const sources = await database.query.workspaceExecutorSource.findMany({
      where: eq(workspaceExecutorSource.workspaceId, input.workspaceId),
      columns: {
        id: true,
        revisionHash: true,
        enabled: true,
        updatedAt: true,
      },
    });
    const nextRevisionHash = createHash("sha256")
      .update(
        JSON.stringify(
          sources.map((source) => ({
            id: source.id,
            revisionHash: source.revisionHash,
            enabled: source.enabled,
            updatedAt: source.updatedAt?.toISOString() ?? null,
          })),
        ),
      )
      .digest("hex");

    if (nextRevisionHash === existing.revisionHash) {
      return existing;
    }
  }

  return rebuildWorkspaceExecutorPackage({
    database,
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
  });
}

export async function setWorkspaceExecutorSourceCredential(input: {
  database?: DatabaseLike;
  workspaceExecutorSourceId: string;
  userId: string;
  secret: string;
  displayName?: string | null;
  enabled?: boolean;
}) {
  const database = input.database ?? db;
  const normalizedSecret = input.secret.trim();
  if (!normalizedSecret) {
    throw new Error("Secret is required.");
  }

  await database
    .insert(workspaceExecutorSourceCredential)
    .values({
      workspaceExecutorSourceId: input.workspaceExecutorSourceId,
      userId: input.userId,
      secret: encrypt(normalizedSecret),
      displayName: input.displayName?.trim() || null,
      enabled: input.enabled ?? true,
    })
    .onConflictDoUpdate({
      target: [
        workspaceExecutorSourceCredential.userId,
        workspaceExecutorSourceCredential.workspaceExecutorSourceId,
      ],
      set: {
        secret: encrypt(normalizedSecret),
        displayName: input.displayName?.trim() || null,
        enabled: input.enabled ?? true,
        updatedAt: new Date(),
      },
    });
}

export async function getWorkspaceExecutorBootstrap(input: {
  database?: DatabaseLike;
  workspaceId: string;
  workspaceName?: string | null;
  userId: string;
  allowedSourceIds?: string[] | null;
}) {
  const database = input.database ?? db;
  const [packageRow, sources, credentials] = await Promise.all([
    ensureWorkspaceExecutorPackage({
      database,
      workspaceId: input.workspaceId,
      workspaceName: input.workspaceName,
    }),
    database.query.workspaceExecutorSource.findMany({
      where:
        input.allowedSourceIds && input.allowedSourceIds.length > 0
          ? and(
              eq(workspaceExecutorSource.workspaceId, input.workspaceId),
              inArray(workspaceExecutorSource.id, input.allowedSourceIds),
            )
          : eq(workspaceExecutorSource.workspaceId, input.workspaceId),
      orderBy: (source, { asc }) => [asc(source.namespace), asc(source.createdAt)],
    }),
    database.query.workspaceExecutorSourceCredential.findMany({
      where: eq(workspaceExecutorSourceCredential.userId, input.userId),
    }),
  ]);

  const config = JSON.parse(packageRow.configJson) as LocalExecutorConfig;
  const credentialBySourceId = new Map(
    credentials.map((credential) => [credential.workspaceExecutorSourceId, credential]),
  );

  const hydratedSources = Object.fromEntries(
    sources.map((source) => {
      const baseConfig = config.sources[source.id] ?? buildBaseSourceConfig(source);
      const hydratedConfig = mergeAuthIntoSourceConfig({
        source,
        credential: credentialBySourceId.get(source.id),
        config: baseConfig,
      });
      return [source.id, hydratedConfig];
    }),
  );

  return {
    revisionHash: packageRow.revisionHash,
    configJson: `${JSON.stringify({ ...config, sources: hydratedSources }, null, 2)}\n`,
    workspaceStateJson: packageRow.workspaceStateJson,
    sources: sources.map((source) => {
      const credential = credentialBySourceId.get(source.id);
      return {
        id: source.id,
        name: source.name,
        namespace: source.namespace,
        kind: source.kind,
        enabled: source.enabled,
        connected: Boolean(credential?.secret && credential.enabled),
      };
    }),
  };
}
