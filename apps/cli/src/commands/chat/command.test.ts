import { describe, expect, it } from "vitest";
import { chatCommand } from "./command";

describe("chat command flags", () => {
  it("exposes the chromeTrace flag", () => {
    const chromeTrace = (chatCommand as { parameters?: { flags?: Record<string, unknown> } }).parameters
      ?.flags?.chromeTrace;
    expect(chromeTrace).toBeDefined();
  });
});
