import { describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    CMDCLAW_EDITION: "cloud",
    APP_URL: undefined as string | undefined,
    NEXT_PUBLIC_APP_URL: undefined as string | undefined,
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

import { GET } from "./route";

describe("GET /robots.txt", () => {
  it("allows crawlers for cloud edition", async () => {
    envMock.CMDCLAW_EDITION = "cloud";
    envMock.APP_URL = undefined;
    envMock.NEXT_PUBLIC_APP_URL = undefined;

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe(`User-Agent: *
Disallow:
`);
  });

  it("blocks crawlers for self-hosted edition", async () => {
    envMock.CMDCLAW_EDITION = "selfhost";
    envMock.APP_URL = undefined;
    envMock.NEXT_PUBLIC_APP_URL = undefined;

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(`User-Agent: *
Disallow: /
`);
  });

  it("includes the sitemap when the app url is configured", async () => {
    envMock.CMDCLAW_EDITION = "cloud";
    envMock.APP_URL = "https://app.example.com/base";
    envMock.NEXT_PUBLIC_APP_URL = undefined;

    const response = await GET();

    expect(await response.text()).toBe(`User-Agent: *
Disallow:
Sitemap: https://app.example.com/sitemap.xml
`);
  });

  it("skips the sitemap when the configured app url is invalid", async () => {
    envMock.CMDCLAW_EDITION = "cloud";
    envMock.APP_URL = "not a url";
    envMock.NEXT_PUBLIC_APP_URL = undefined;

    const response = await GET();

    expect(await response.text()).toBe(`User-Agent: *
Disallow:
`);
  });
});
