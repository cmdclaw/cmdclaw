import { describe, expect, it } from "vitest";
import { buildTaskDonePushBody } from "./web-push-service";

describe("buildTaskDonePushBody", () => {
  it("returns a default body when content is empty", () => {
    expect(buildTaskDonePushBody("   ")).toBe("Your task is complete.");
  });

  it("normalizes whitespace", () => {
    expect(buildTaskDonePushBody("hello \n\n world")).toBe("hello world");
  });

  it("truncates long content", () => {
    const body = buildTaskDonePushBody("a".repeat(200));
    expect(body).toHaveLength(160);
    expect(body.endsWith("...")).toBe(true);
  });
});
