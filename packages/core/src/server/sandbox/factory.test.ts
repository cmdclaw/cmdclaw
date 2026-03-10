import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SandboxProvider = "e2b" | "daytona" | "docker";

const originalSandboxEnv = {
  SANDBOX_DEFAULT: process.env.SANDBOX_DEFAULT,
  E2B_API_KEY: process.env.E2B_API_KEY,
  DAYTONA_API_KEY: process.env.DAYTONA_API_KEY,
  DOCKER_HOST: process.env.DOCKER_HOST,
};

async function loadFactoryModule() {
  vi.resetModules();
  vi.doMock("node:fs", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    return {
      ...actual,
      existsSync: () => false,
    };
  });
  return import("./factory");
}

function setSandboxEnv(params: {
  sandboxDefault: SandboxProvider;
  e2bConfigured?: boolean;
  daytonaConfigured?: boolean;
  dockerConfigured?: boolean;
}) {
  process.env.SANDBOX_DEFAULT = params.sandboxDefault;

  if (params.e2bConfigured) {
    process.env.E2B_API_KEY = "test-e2b-key";
  } else {
    delete process.env.E2B_API_KEY;
  }

  if (params.daytonaConfigured) {
    process.env.DAYTONA_API_KEY = "test-daytona-key";
  } else {
    delete process.env.DAYTONA_API_KEY;
  }

  if (params.dockerConfigured) {
    process.env.DOCKER_HOST = "unix:///tmp/docker.sock";
  } else {
    delete process.env.DOCKER_HOST;
  }
}

describe("sandbox factory", () => {
  beforeEach(() => {
    setSandboxEnv({
      sandboxDefault: "e2b",
      e2bConfigured: true,
      daytonaConfigured: false,
      dockerConfigured: false,
    });
  });

  afterEach(() => {
    vi.doUnmock("node:fs");

    if (originalSandboxEnv.SANDBOX_DEFAULT === undefined) {
      delete process.env.SANDBOX_DEFAULT;
    } else {
      process.env.SANDBOX_DEFAULT = originalSandboxEnv.SANDBOX_DEFAULT;
    }

    if (originalSandboxEnv.E2B_API_KEY === undefined) {
      delete process.env.E2B_API_KEY;
    } else {
      process.env.E2B_API_KEY = originalSandboxEnv.E2B_API_KEY;
    }

    if (originalSandboxEnv.DAYTONA_API_KEY === undefined) {
      delete process.env.DAYTONA_API_KEY;
    } else {
      process.env.DAYTONA_API_KEY = originalSandboxEnv.DAYTONA_API_KEY;
    }

    if (originalSandboxEnv.DOCKER_HOST === undefined) {
      delete process.env.DOCKER_HOST;
    } else {
      process.env.DOCKER_HOST = originalSandboxEnv.DOCKER_HOST;
    }
  });

  it("uses E2B when SANDBOX_DEFAULT=e2b and E2B is configured", async () => {
    const { getPreferredCloudSandboxProvider } = await loadFactoryModule();
    expect(getPreferredCloudSandboxProvider()).toBe("e2b");
  });

  it("uses Daytona when SANDBOX_DEFAULT=daytona and Daytona is configured", async () => {
    setSandboxEnv({
      sandboxDefault: "daytona",
      e2bConfigured: true,
      daytonaConfigured: true,
    });

    const { getPreferredCloudSandboxProvider } = await loadFactoryModule();
    expect(getPreferredCloudSandboxProvider()).toBe("daytona");
  });

  it("throws when SANDBOX_DEFAULT=e2b but E2B is not configured, without falling back", async () => {
    setSandboxEnv({
      sandboxDefault: "e2b",
      e2bConfigured: false,
      daytonaConfigured: true,
    });

    const { getPreferredCloudSandboxProvider } = await loadFactoryModule();
    expect(() => getPreferredCloudSandboxProvider()).toThrow(
      "SANDBOX_DEFAULT is set to 'e2b' but E2B_API_KEY is not configured",
    );
  });

  it("throws when SANDBOX_DEFAULT=daytona but Daytona is not configured, without falling back", async () => {
    setSandboxEnv({
      sandboxDefault: "daytona",
      e2bConfigured: true,
      daytonaConfigured: false,
    });

    const { getPreferredCloudSandboxProvider } = await loadFactoryModule();
    expect(() => getPreferredCloudSandboxProvider()).toThrow(
      "SANDBOX_DEFAULT is set to 'daytona' but DAYTONA_API_KEY is not configured",
    );
  });

  it("uses Docker when SANDBOX_DEFAULT=docker and Docker is configured", async () => {
    setSandboxEnv({
      sandboxDefault: "docker",
      e2bConfigured: true,
      dockerConfigured: true,
    });

    const { getPreferredCloudSandboxProvider } = await loadFactoryModule();
    expect(getPreferredCloudSandboxProvider()).toBe("docker");
  });

  it("throws when SANDBOX_DEFAULT=docker but Docker is not configured", async () => {
    setSandboxEnv({
      sandboxDefault: "docker",
      e2bConfigured: true,
      dockerConfigured: false,
    });

    const { getPreferredCloudSandboxProvider } = await loadFactoryModule();
    expect(() => getPreferredCloudSandboxProvider()).toThrow(
      "SANDBOX_DEFAULT is set to 'docker' but Docker is not configured",
    );
  });
});
