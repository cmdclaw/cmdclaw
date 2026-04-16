import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { routeMcpRequest } from "./router";
import { shouldManageGatewayChildren, startManagedGatewayChildren } from "./supervisor";
import { MCP_SERVER_REGISTRY } from "../../shared/registry";

const port = Number.parseInt(process.env.PORT ?? "3010", 10);
const hostname = process.env.HOST ?? "0.0.0.0";
const publicHostname = hostname === "0.0.0.0" ? "127.0.0.1" : hostname;

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

function buildProxyRequest(request: Request, target: URL): Request {
  const headers = new Headers(request.headers);
  headers.set("host", target.host);
  return new Request(target, {
    method: request.method,
    headers,
    body: request.body,
    duplex: "half",
    redirect: "manual",
  } as RequestInit & { duplex: "half" });
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

        if (requestUrl.pathname === "/" || requestUrl.pathname === "") {
          return Response.json({
            ok: true,
            servers: ["internal", "gmail"],
            managedChildren: shouldManageGatewayChildren(process.env),
            targets: Object.fromEntries(
              Object.entries(routingEnv).filter(([key]) => key.startsWith("CMDCLAW_") && key.endsWith("_MCP_TARGET")),
            ),
          });
        }

        let routed;
        try {
          routed = routeMcpRequest(requestUrl, routingEnv);
        } catch (error) {
          return new Response(error instanceof Error ? error.message : "Gateway misconfigured", {
            status: 500,
          });
        }

        if (!routed) {
          return new Response("Not found", { status: 404 });
        }

        return fetch(buildProxyRequest(request, routed.target));
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
