import { describe, expect, it, vi } from "vitest";

const envMock = {
  CMDCLAW_EDITION: "cloud",
};

vi.mock("@/env", () => ({
  env: envMock,
}));

import { GET } from "./route";

describe("GET /robots.txt", () => {
  it("allows crawlers for cloud edition", async () => {
    envMock.CMDCLAW_EDITION = "cloud";

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(`User-agent: *
Allow: /
`);
  });

  it("blocks crawlers for self-hosted edition", async () => {
    envMock.CMDCLAW_EDITION = "selfhost";

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(`User-agent: *
Disallow: /
`);
  });
});
