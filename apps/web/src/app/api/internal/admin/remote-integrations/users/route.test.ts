import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { listLocalRemoteIntegrationUsersMock } = vi.hoisted(() => ({
  listLocalRemoteIntegrationUsersMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    CMDCLAW_SERVER_SECRET: "test-secret",
  },
}));

vi.mock("@cmdclaw/core/server/integrations/remote-integrations", () => {
  return {
    listLocalRemoteIntegrationUsers: listLocalRemoteIntegrationUsersMock,
    remoteIntegrationTypeSchema: z.enum([
      "google_gmail",
      "outlook",
      "outlook_calendar",
      "google_calendar",
      "google_docs",
      "google_sheets",
      "google_drive",
      "notion",
      "github",
      "airtable",
      "slack",
      "hubspot",
      "salesforce",
      "dynamics",
      "reddit",
      "twitter",
    ]),
    remoteIntegrationUserSummarySchema: z.object({
      id: z.string().min(1),
      email: z.string().email(),
      name: z.string().nullable(),
      enabledIntegrationTypes: z.array(z.string()),
    }),
  };
});

import { POST } from "./route";

describe("POST /api/internal/admin/remote-integrations/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listLocalRemoteIntegrationUsersMock.mockResolvedValue([
      {
        id: "remote-user-1",
        email: "client@example.com",
        name: "Client User",
        enabledIntegrationTypes: ["google_gmail", "hubspot"],
      },
    ]);
  });

  it("rejects unauthorized requests", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/internal/admin/remote-integrations/users", {
        method: "POST",
        body: JSON.stringify({ query: "client" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns matching users for authorized requests", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/internal/admin/remote-integrations/users", {
        method: "POST",
        headers: {
          authorization: "Bearer test-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ query: "client", limit: 5 }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      users: [
        {
          id: "remote-user-1",
          email: "client@example.com",
          name: "Client User",
          enabledIntegrationTypes: ["google_gmail", "hubspot"],
        },
      ],
    });
    expect(listLocalRemoteIntegrationUsersMock).toHaveBeenCalledWith({
      query: "client",
      limit: 5,
    });
  });
});
