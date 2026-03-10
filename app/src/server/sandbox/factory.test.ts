import { beforeEach, describe, expect, it, vi } from "vitest";

type MockState = {
  sandboxDefault: "e2b" | "daytona" | "docker";
  isE2BConfigured: boolean;
  isDaytonaConfigured: boolean;
  isDockerConfigured: boolean;
};

function getState(): MockState {
  return (globalThis as unknown as { __sandboxFactoryMockState: MockState })
    .__sandboxFactoryMockState;
}

(globalThis as unknown as { __sandboxFactoryMockState: MockState }).__sandboxFactoryMockState = {
  sandboxDefault: "e2b",
  isE2BConfigured: true,
  isDaytonaConfigured: false,
  isDockerConfigured: false,
};

vi.mock("@/env", () => ({
  env: new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "SANDBOX_DEFAULT") {
          return getState().sandboxDefault;
        }
        return undefined;
      },
    },
  ),
}));

vi.mock("./e2b", () => ({
  E2BSandboxBackend: class E2BSandboxBackend {
    readonly provider = "e2b";
  },
  isE2BConfigured: () => getState().isE2BConfigured,
}));

vi.mock("./daytona", () => ({
  DaytonaSandboxBackend: class DaytonaSandboxBackend {
    readonly provider = "daytona";
  },
  isDaytonaConfigured: () => getState().isDaytonaConfigured,
}));

vi.mock("./docker", () => ({
  DockerSandboxBackend: class DockerSandboxBackend {
    readonly provider = "docker";
  },
  isDockerConfigured: () => getState().isDockerConfigured,
}));

import { getPreferredCloudSandboxProvider } from "@/server/sandbox/factory";

describe("sandbox factory", () => {
  beforeEach(() => {
    const state = getState();
    state.sandboxDefault = "e2b";
    state.isE2BConfigured = true;
    state.isDaytonaConfigured = false;
    state.isDockerConfigured = false;
  });

  it("uses E2B when SANDBOX_DEFAULT=e2b and E2B is configured", () => {
    expect(getPreferredCloudSandboxProvider()).toBe("e2b");
  });

  it("uses Daytona when SANDBOX_DEFAULT=daytona and Daytona is configured", () => {
    const state = getState();
    state.sandboxDefault = "daytona";
    state.isDaytonaConfigured = true;

    expect(getPreferredCloudSandboxProvider()).toBe("daytona");
  });

  it("throws when SANDBOX_DEFAULT=e2b but E2B is not configured, without falling back", () => {
    const state = getState();
    state.isE2BConfigured = false;
    state.isDaytonaConfigured = true;

    expect(() => getPreferredCloudSandboxProvider()).toThrow(
      "SANDBOX_DEFAULT is set to 'e2b' but E2B_API_KEY is not configured",
    );
  });

  it("throws when SANDBOX_DEFAULT=daytona but Daytona is not configured, without falling back", () => {
    const state = getState();
    state.sandboxDefault = "daytona";
    state.isDaytonaConfigured = false;
    state.isE2BConfigured = true;

    expect(() => getPreferredCloudSandboxProvider()).toThrow(
      "SANDBOX_DEFAULT is set to 'daytona' but DAYTONA_API_KEY is not configured",
    );
  });

  it("uses Docker when SANDBOX_DEFAULT=docker and Docker is configured", () => {
    const state = getState();
    state.sandboxDefault = "docker";
    state.isDockerConfigured = true;

    expect(getPreferredCloudSandboxProvider()).toBe("docker");
  });

  it("throws when SANDBOX_DEFAULT=docker but Docker is not configured", () => {
    const state = getState();
    state.sandboxDefault = "docker";
    state.isDockerConfigured = false;

    expect(() => getPreferredCloudSandboxProvider()).toThrow(
      "SANDBOX_DEFAULT is set to 'docker' but Docker is not configured",
    );
  });
});
