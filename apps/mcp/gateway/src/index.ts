import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { matchProtectedResourceMetadataRequest, routeMcpRequest } from "./router";
import { shouldManageGatewayChildren, startManagedGatewayChildren } from "./supervisor";
import {
  buildProtectedResourceMetadataPath,
  MCP_SERVER_REGISTRY,
} from "../../shared/registry";

const port = Number.parseInt(process.env.PORT ?? "3010", 10);
const hostname = process.env.HOST ?? "0.0.0.0";
const publicHostname = hostname === "0.0.0.0" ? "127.0.0.1" : hostname;
const GATEWAY_AUTHORIZATION_PATH = "/authorize";
const GATEWAY_TOKEN_PATH = "/token";
const GATEWAY_REGISTER_PATH = "/register";
const GATEWAY_AUTH_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";
const GATEWAY_OPENID_CONFIGURATION_PATH = "/.well-known/openid-configuration";

type ListeningProcess = {
  pid: number;
  command: string | null;
};

function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

function getListeningProcess(port: number): ListeningProcess | null {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"], {
    encoding: "utf8",
  });

  if (result.status !== 0 || !result.stdout) {
    return null;
  }

  let pid: number | null = null;
  let command: string | null = null;

  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.startsWith("p") && pid === null) {
      const value = Number.parseInt(line.slice(1), 10);
      if (!Number.isNaN(value)) {
        pid = value;
      }
      continue;
    }

    if (line.startsWith("c") && command === null) {
      command = line.slice(1) || null;
    }

    if (pid !== null && command !== null) {
      break;
    }
  }

  if (pid === null) {
    return null;
  }

  return { pid, command };
}

async function assertGatewayPortAvailable(port: number, host: string) {
  if (await isPortAvailable(port, host)) {
    return;
  }

  const processInfo = getListeningProcess(port);
  if (processInfo) {
    const commandSuffix = processInfo.command ? ` (${processInfo.command})` : "";
    throw new Error(
      `Gateway port ${port} is already in use by PID ${processInfo.pid}${commandSuffix}. Kill it with: kill ${processInfo.pid}`,
    );
  }

  throw new Error(`Gateway port ${port} is already in use. Run: lsof -nP -iTCP:${port} -sTCP:LISTEN`);
}

function resolveAuthorizationServerOrigin(requestUrl: URL): string {
  const configured =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.CMDCLAW_SERVER_URL?.trim();

  if (configured && URL.canParse(configured)) {
    return new URL(configured).origin;
  }

  return requestUrl.origin;
}

function getGatewayCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");

  return {
    "Access-Control-Allow-Origin": origin?.trim() || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Expose-Headers": "WWW-Authenticate",
    Vary: "Origin",
  };
}

function withGatewayCors(request: Request, response: Response): Response {
  const next = new Response(response.body, response);
  const headers = getGatewayCorsHeaders(request);
  Object.entries(headers).forEach(([key, value]) => {
    next.headers.set(key, value);
  });
  return next;
}

function buildGatewayAuthorizationServerMetadata(requestUrl: URL) {
  return {
    issuer: requestUrl.origin,
    authorization_endpoint: new URL(
      GATEWAY_AUTHORIZATION_PATH,
      requestUrl.origin,
    ).toString(),
    token_endpoint: new URL(GATEWAY_TOKEN_PATH, requestUrl.origin).toString(),
    registration_endpoint: new URL(GATEWAY_REGISTER_PATH, requestUrl.origin).toString(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: Object.keys(MCP_SERVER_REGISTRY),
  };
}

function buildProtectedResourceMetadata(requestUrl: URL, slug: keyof typeof MCP_SERVER_REGISTRY) {
  const server = MCP_SERVER_REGISTRY[slug];
  return {
    resource: new URL(`${server.publicBasePath}/mcp`, requestUrl.origin).toString(),
    authorization_servers: [requestUrl.origin],
    scopes_supported: [slug],
    resource_name: server.name,
  };
}

function buildProxyRequest(request: Request, target: URL, requestUrl: URL): Request {
  const headers = new Headers(request.headers);
  headers.set("host", target.host);
  headers.set("x-cmdclaw-public-origin", requestUrl.origin);
  headers.set("x-forwarded-host", requestUrl.host);
  headers.set("x-forwarded-proto", requestUrl.protocol.replace(":", ""));
  return new Request(target, {
    method: request.method,
    headers,
    body: request.body,
    duplex: "half",
    redirect: "manual",
  } as RequestInit & { duplex: "half" });
}

function buildAppProxyRequest(
  request: Request,
  targetPath: string,
  requestUrl: URL,
): Request {
  const appOrigin = resolveAuthorizationServerOrigin(requestUrl);
  const target = new URL(targetPath + requestUrl.search, appOrigin);

  return buildProxyRequest(request, target, requestUrl);
}

async function main() {
  let routingEnv: Record<string, string | undefined> = { ...process.env };
  let shutdownManagedChildren: (() => void) | null = null;

  await assertGatewayPortAvailable(port, hostname);

  if (shouldManageGatewayChildren(process.env)) {
    const managedChildren = await startManagedGatewayChildren({
      env: process.env,
      rootDir: process.cwd(),
    });
    routingEnv = {
      ...routingEnv,
      ...managedChildren.targetEnv,
    };
    shutdownManagedChildren = managedChildren.shutdown;
    console.log(
      `[gateway] managing children: ${managedChildren.children
        .map((child) => `${child.slug}@${child.target}`)
        .join(", ")}`,
    );
  }

  let server: ReturnType<typeof Bun.serve> | null = null;
  try {
    server = Bun.serve({
      port,
      hostname,
      async fetch(request) {
        const requestUrl = new URL(request.url);

        if (request.method === "OPTIONS") {
          return withGatewayCors(request, new Response(null, { status: 204 }));
        }

        if (requestUrl.pathname === "/" || requestUrl.pathname === "") {
          return withGatewayCors(
            request,
            Response.json({
              ok: true,
              servers: ["internal", "gmail"],
              managedChildren: shouldManageGatewayChildren(process.env),
              authorizationServer: `${requestUrl.origin}${GATEWAY_AUTH_SERVER_METADATA_PATH}`,
              protectedResources: Object.keys(MCP_SERVER_REGISTRY).map((slug) =>
                new URL(
                  buildProtectedResourceMetadataPath(slug as keyof typeof MCP_SERVER_REGISTRY),
                  requestUrl.origin,
                ).toString(),
              ),
              targets: Object.fromEntries(
                Object.entries(routingEnv).filter(([key]) =>
                  key.startsWith("CMDCLAW_") && key.endsWith("_MCP_TARGET"),
                ),
              ),
            }),
          );
        }

        if (
          requestUrl.pathname === GATEWAY_AUTH_SERVER_METADATA_PATH ||
          requestUrl.pathname === GATEWAY_OPENID_CONFIGURATION_PATH
        ) {
          return withGatewayCors(
            request,
            Response.json(buildGatewayAuthorizationServerMetadata(requestUrl), {
              headers: {
                "Cache-Control": "no-store",
              },
            }),
          );
        }

        if (requestUrl.pathname === GATEWAY_AUTHORIZATION_PATH) {
          return withGatewayCors(
            request,
            await fetch(
              buildAppProxyRequest(request, "/api/mcp/oauth/authorize", requestUrl),
            ),
          );
        }

        if (requestUrl.pathname === GATEWAY_TOKEN_PATH) {
          return withGatewayCors(
            request,
            await fetch(buildAppProxyRequest(request, "/api/mcp/oauth/token", requestUrl)),
          );
        }

        if (requestUrl.pathname === GATEWAY_REGISTER_PATH) {
          return withGatewayCors(
            request,
            await fetch(buildAppProxyRequest(request, "/api/mcp/oauth/register", requestUrl)),
          );
        }

        const protectedResourceMatch = matchProtectedResourceMetadataRequest(requestUrl);
        if (protectedResourceMatch) {
          return withGatewayCors(
            request,
            Response.json(
              buildProtectedResourceMetadata(
                requestUrl,
                protectedResourceMatch.slug as keyof typeof MCP_SERVER_REGISTRY,
              ),
              {
                headers: {
                  "Cache-Control": "no-store",
                },
              },
            ),
          );
        }

        if (requestUrl.pathname === "/.well-known/oauth-protected-resource") {
          return withGatewayCors(
            request,
            Response.json(
              {
                resources: Object.keys(MCP_SERVER_REGISTRY).map((slug) =>
                  new URL(
                    buildProtectedResourceMetadataPath(slug as keyof typeof MCP_SERVER_REGISTRY),
                    requestUrl.origin,
                  ).toString(),
                ),
              },
              {
                headers: {
                  "Cache-Control": "no-store",
                },
              },
            ),
          );
        }

        let routed;
        try {
          routed = routeMcpRequest(requestUrl, routingEnv);
        } catch (error) {
          return withGatewayCors(
            request,
            new Response(error instanceof Error ? error.message : "Gateway misconfigured", {
              status: 500,
            }),
          );
        }

        if (!routed) {
          return withGatewayCors(request, new Response("Not found", { status: 404 }));
        }

        return withGatewayCors(
          request,
          await fetch(buildProxyRequest(request, routed.target, requestUrl)),
        );
      },
    });
  } catch (error) {
    shutdownManagedChildren?.();
    throw error;
  }

  let isShuttingDown = false;
  const cleanup = (exitCode?: number) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    server?.stop(true);
    shutdownManagedChildren?.();

    if (typeof exitCode === "number") {
      process.exit(exitCode);
    }
  };
  process.once("SIGINT", () => cleanup(0));
  process.once("SIGTERM", () => cleanup(0));
  process.once("exit", () => cleanup());

  console.log(`MCP gateway listening on http://${hostname}:${port}`);
  console.log("[gateway] public MCP endpoints:");
  for (const server of Object.values(MCP_SERVER_REGISTRY)) {
    console.log(`  - http://${publicHostname}:${port}${server.publicBasePath}/mcp`);
  }
}

await main();
