import { describe, expect, it } from "vitest";
import { parseChaosDurationMs } from "./chaos";

describe("parseChaosDurationMs", () => {
  it.each([
    ["5000ms", 5_000],
    ["60s", 60_000],
    ["1m", 60_000],
  ])("parses %s", (input, expected) => {
    expect(parseChaosDurationMs(input)).toBe(expected);
  });

  it.each(["60", "0s", "-1s", "1h", "1.5s", "ms"])("rejects %s", (input) => {
    expect(() => parseChaosDurationMs(input)).toThrow("Invalid duration");
  });
});
