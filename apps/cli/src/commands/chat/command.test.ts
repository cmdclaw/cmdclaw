import { describe, expect, it } from "vitest";
import { chatCommand } from "./command";

describe("chat command flags", () => {
  it("exposes the perfettoTrace flag and removes chromeTrace", () => {
    const flags = (chatCommand as { parameters?: { flags?: Record<string, unknown> } }).parameters
      ?.flags;
    expect(flags?.perfettoTrace).toBeDefined();
    expect(flags?.chromeTrace).toBeUndefined();
  });
});
