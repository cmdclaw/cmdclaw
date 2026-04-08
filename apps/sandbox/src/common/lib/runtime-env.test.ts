import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("loadRuntimeEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reloads values on every call, overwrites synced keys, and clears removed keys", async () => {
    const readFileSync = vi
      .fn()
      .mockReturnValueOnce(
        JSON.stringify({
          APP_URL: "https://first.example.com",
          GMAIL_ACCESS_TOKEN: "first-token",
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          GMAIL_ACCESS_TOKEN: "second-token",
        }),
      );

    vi.doMock("node:fs", () => ({ readFileSync }));
    const { loadRuntimeEnv } = await import("./runtime-env");

    process.env.APP_URL = "https://stale.example.com";
    loadRuntimeEnv();
    expect(process.env.APP_URL).toBe("https://first.example.com");
    expect(process.env.GMAIL_ACCESS_TOKEN).toBe("first-token");

    loadRuntimeEnv();
    expect(process.env.APP_URL).toBeUndefined();
    expect(process.env.GMAIL_ACCESS_TOKEN).toBe("second-token");
  });

  it("clears previously synced keys when the runtime env file disappears", async () => {
    const readFileSync = vi
      .fn()
      .mockReturnValueOnce(
        JSON.stringify({
          CONVERSATION_ID: "conv-1",
        }),
      )
      .mockImplementationOnce(() => {
        throw new Error("missing");
      });

    vi.doMock("node:fs", () => ({ readFileSync }));
    const { loadRuntimeEnv } = await import("./runtime-env");

    loadRuntimeEnv();
    expect(process.env.CONVERSATION_ID).toBe("conv-1");

    loadRuntimeEnv();
    expect(process.env.CONVERSATION_ID).toBeUndefined();
  });
});
