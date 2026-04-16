import { afterEach, describe, expect, it } from "vitest";
import { getDaytonaClientConfig, isDaytonaConfigured } from "./daytona";

const originalEnv = {
  DAYTONA_API_KEY: process.env.DAYTONA_API_KEY,
  DAYTONA_API_URL: process.env.DAYTONA_API_URL,
  DAYTONA_TARGET: process.env.DAYTONA_TARGET,
  DAYTONA_SERVER_URL: process.env.DAYTONA_SERVER_URL,
};

function restoreEnvVar(name: keyof typeof originalEnv) {
  const value = originalEnv[name];
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe("daytona sandbox config", () => {
  afterEach(() => {
    restoreEnvVar("DAYTONA_API_KEY");
    restoreEnvVar("DAYTONA_API_URL");
    restoreEnvVar("DAYTONA_TARGET");
    restoreEnvVar("DAYTONA_SERVER_URL");
  });

  it("builds Daytona client config from the self-hosted env", () => {
    process.env.DAYTONA_API_KEY = "test-daytona-key";
    process.env.DAYTONA_API_URL = "http://localhost:3300/api";
    process.env.DAYTONA_TARGET = "us";

    expect(getDaytonaClientConfig()).toEqual({
      apiKey: "test-daytona-key",
      apiUrl: "http://localhost:3300/api",
      target: "us",
    });
    expect(isDaytonaConfigured()).toBe(true);
  });

  it("ignores legacy serverUrl env for the runtime client config", () => {
    process.env.DAYTONA_API_KEY = "test-daytona-key";
    delete process.env.DAYTONA_API_URL;
    delete process.env.DAYTONA_TARGET;
    process.env.DAYTONA_SERVER_URL = "https://cloud.daytona.io";

    expect(getDaytonaClientConfig()).toEqual({
      apiKey: "test-daytona-key",
    });
  });
});
