import { appendFileSync } from "node:fs";

type DeployStatus =
  | "created"
  | "build_in_progress"
  | "update_in_progress"
  | "live"
  | "deactivated"
  | "build_failed"
  | "update_failed"
  | "canceled"
  | string;

type RenderDeploy = {
  id: string;
  status?: DeployStatus;
  commit?: {
    id?: string;
    message?: string;
  };
  createdAt?: string;
  finishedAt?: string;
};

type RenderService = {
  id: string;
  name: string;
  type?: string;
};

type RenderApiError = {
  message?: string;
  error?: string;
};

type Command = "previous-success" | "deploy" | "rollback" | "wait";

const renderApiBaseUrl = "https://api.render.com/v1";
const successStatuses = new Set(["live"]);
const failedStatuses = new Set(["build_failed", "update_failed", "canceled", "deactivated"]);

function fail(message: string): never {
  console.error(`[render-deploy] ${message}`);
  process.exit(1);
}

function readArg(name: string): string | null {
  const prefix = `${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  if (value) {
    return value.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);
  if (index >= 0) {
    return process.argv[index + 1] ?? null;
  }

  return null;
}

function requireArg(name: string): string {
  const value = readArg(name)?.trim();
  if (!value) {
    fail(`Missing required argument ${name}`);
  }
  return value;
}

function getApiKey(): string {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (!apiKey) {
    fail("Missing RENDER_API_KEY");
  }
  return apiKey;
}

async function renderFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${renderApiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = body as RenderApiError | null;
    fail(
      `Render API ${init.method ?? "GET"} ${path} failed with ${response.status}: ${
        error?.message ?? error?.error ?? text
      }`,
    );
  }

  return body as T;
}

function unwrapDeploy(value: unknown): RenderDeploy {
  if (typeof value !== "object" || value === null) {
    fail("Render API response did not include a deploy object");
  }

  const record = value as Record<string, unknown>;
  const candidate = "deploy" in record ? record.deploy : value;
  if (typeof candidate !== "object" || candidate === null) {
    fail("Render API response did not include a deploy object");
  }

  const deploy = candidate as RenderDeploy;
  if (!deploy.id) {
    fail("Render deploy response did not include an id");
  }
  return deploy;
}

function unwrapDeploys(value: unknown): RenderDeploy[] {
  if (!Array.isArray(value)) {
    fail("Render API deploy list response was not an array");
  }

  return value.map((entry) => unwrapDeploy(entry));
}

function unwrapService(value: unknown): RenderService {
  if (typeof value !== "object" || value === null) {
    fail("Render API response did not include a service object");
  }

  const record = value as Record<string, unknown>;
  const candidate = "service" in record ? record.service : value;
  if (typeof candidate !== "object" || candidate === null) {
    fail("Render API response did not include a service object");
  }

  const service = candidate as RenderService;
  if (!service.id || !service.name) {
    fail("Render service response did not include an id and name");
  }
  return service;
}

function unwrapServices(value: unknown): RenderService[] {
  if (!Array.isArray(value)) {
    fail("Render API service list response was not an array");
  }

  return value.map((entry) => unwrapService(entry));
}

function writeOutput(name: string, value: string): void {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(githubOutput, `${name}=${value}\n`);
  }
  console.log(`${name}=${value}`);
}

async function resolveServiceIdByName(serviceName: string): Promise<string> {
  const services = unwrapServices(
    await renderFetch(`/services?limit=100&name=${encodeURIComponent(serviceName)}`),
  );
  const matches = services.filter((service) => service.name === serviceName);

  if (matches.length === 0) {
    fail(`No Render service found with name "${serviceName}"`);
  }

  if (matches.length > 1) {
    fail(
      `Multiple Render services found with name "${serviceName}". Use unique service names before deploying.`,
    );
  }

  const service = matches[0];
  console.log(`[render-deploy] Resolved service "${service.name}" to ${service.id}`);
  return service.id;
}

async function resolveServiceId(): Promise<string> {
  const explicitServiceId = readArg("--service-id")?.trim();
  if (explicitServiceId) {
    return explicitServiceId;
  }

  const serviceName = readArg("--service-name")?.trim();
  if (!serviceName) {
    fail("Missing required argument --service-id or --service-name");
  }

  return resolveServiceIdByName(serviceName);
}

async function getDeploy(serviceId: string, deployId: string): Promise<RenderDeploy> {
  return unwrapDeploy(await renderFetch(`/services/${serviceId}/deploys/${deployId}`));
}

async function waitForDeploy(serviceId: string, deployId: string): Promise<RenderDeploy> {
  const timeoutMs = Number(readArg("--timeout-ms") ?? "1800000");
  const pollMs = Number(readArg("--poll-ms") ?? "15000");
  const startedAt = Date.now();

  while (true) {
    const deploy = await getDeploy(serviceId, deployId);
    const status = deploy.status ?? "unknown";
    console.log(`[render-deploy] ${serviceId} ${deployId} status=${status}`);

    if (successStatuses.has(status)) {
      return deploy;
    }

    if (failedStatuses.has(status)) {
      fail(`Deploy ${deployId} for service ${serviceId} failed with status ${status}`);
    }

    if (Date.now() - startedAt > timeoutMs) {
      fail(`Timed out waiting for deploy ${deployId} for service ${serviceId}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

async function findPreviousSuccessfulDeploy(serviceId: string): Promise<RenderDeploy | null> {
  const deploys = unwrapDeploys(await renderFetch(`/services/${serviceId}/deploys?limit=20`));

  return deploys.find((deploy) => successStatuses.has(deploy.status ?? "")) ?? null;
}

async function createDeploy(serviceId: string, commitId: string): Promise<RenderDeploy> {
  return unwrapDeploy(
    await renderFetch(`/services/${serviceId}/deploys`, {
      method: "POST",
      body: JSON.stringify({ commitId, clearCache: "do_not_clear" }),
    }),
  );
}

async function rollbackDeploy(serviceId: string, deployId: string): Promise<RenderDeploy> {
  return unwrapDeploy(
    await renderFetch(`/services/${serviceId}/rollback`, {
      method: "POST",
      body: JSON.stringify({ deployId }),
    }),
  );
}

async function main(): Promise<void> {
  const command = process.argv[2] as Command | undefined;
  if (!command) {
    fail("Usage: bun scripts/release/render-deploy.ts <previous-success|deploy|rollback|wait>");
  }

  const serviceId = await resolveServiceId();

  if (command === "previous-success") {
    const deploy = await findPreviousSuccessfulDeploy(serviceId);
    if (!deploy) {
      fail(`No previous successful deploy found for service ${serviceId}`);
    }
    writeOutput("deploy_id", deploy.id);
    return;
  }

  if (command === "deploy") {
    const commitId = requireArg("--commit");
    const deploy = await createDeploy(serviceId, commitId);
    writeOutput("deploy_id", deploy.id);
    await waitForDeploy(serviceId, deploy.id);
    return;
  }

  if (command === "rollback") {
    const targetDeployId = requireArg("--deploy-id");
    const deploy = await rollbackDeploy(serviceId, targetDeployId);
    writeOutput("rollback_deploy_id", deploy.id);
    await waitForDeploy(serviceId, deploy.id);
    return;
  }

  if (command === "wait") {
    const deployId = requireArg("--deploy-id");
    await waitForDeploy(serviceId, deployId);
    return;
  }

  fail(`Unsupported command: ${command}`);
}

if (import.meta.main) {
  void main();
}
