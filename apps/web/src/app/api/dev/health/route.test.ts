import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/dev/health", () => {
  it("returns a public readiness response", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
