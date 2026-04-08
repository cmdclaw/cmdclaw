import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("IntegrationPermissionsPlugin", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    global.fetch = vi.fn() as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it("does not request auth when Gmail token exists in synced runtime env", async () => {
    const readFileSync = vi.fn().mockReturnValue(
      JSON.stringify({
        GMAIL_ACCESS_TOKEN: "gmail-token",
        APP_URL: "https://app.cmdclaw.ai",
      }),
    );
    vi.doMock("node:fs", () => ({ readFileSync }));

    const { IntegrationPermissionsPlugin } = await import("./integration-permissions");
    const plugin = await IntegrationPermissionsPlugin();

    await expect(
      plugin["tool.execute.before"](
        { tool: "bash" },
        { args: { command: "google-gmail list -l 1" } },
      ),
    ).resolves.toBeUndefined();

    expect(process.env.GMAIL_ACCESS_TOKEN).toBe("gmail-token");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
