import { afterEach, describe, expect, it, vi } from "vitest";
import searchClients from "../tools/search_clients";

describe("search_clients", () => {
  const originalFetch = globalThis.fetch;
  const originalServerUrl = process.env.CMDCLAW_SERVER_URL;
  const originalServerSecret = process.env.CMDCLAW_SERVER_SECRET;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalServerUrl === undefined) {
      delete process.env.CMDCLAW_SERVER_URL;
    } else {
      process.env.CMDCLAW_SERVER_URL = originalServerUrl;
    }
    if (originalServerSecret === undefined) {
      delete process.env.CMDCLAW_SERVER_SECRET;
    } else {
      process.env.CMDCLAW_SERVER_SECRET = originalServerSecret;
    }
    vi.restoreAllMocks();
  });

  function authExtra() {
    return {
      authInfo: {
        extra: {
          audience: "galien",
          userId: "cmdclaw-user-id",
          workspaceId: "workspace-id",
        },
      },
    } as never;
  }

  function installSearchFetchMock(clients: unknown[]) {
    const bearerToken = "Bearer header.payload.signature";
    const requests: string[] = [];

    process.env.CMDCLAW_SERVER_URL = "https://cmdclaw.example";
    process.env.CMDCLAW_SERVER_SECRET = "server-secret";

    globalThis.fetch = vi.fn(async (input, init) => {
      requests.push(String(input));

      if (String(input) === "https://cmdclaw.example/api/internal/mcp/galien-credentials") {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer server-secret",
        });
        return new Response(
          JSON.stringify({
            username: "user@example.com",
            password: "password",
            targetEnv: "preprod",
            apiBaseUrl: "https://api.frontline.galien.preprod.webhelpmedica.com",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      if (String(input).endsWith("/api/v1/tokens/login")) {
        return new Response("[]", {
          status: 200,
          headers: {
            authorization: bearerToken,
          },
        });
      }

      expect(init?.headers).toMatchObject({
        authorization: bearerToken,
      });
      return new Response(JSON.stringify({ total: clients.length, data: clients }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as unknown as typeof fetch;

    return requests;
  }

  it("fetches the accessible clients list without Galien's broken filters parameter", async () => {
    const requests = installSearchFetchMock([
      {
        id: 21005,
        cipCode: "2257878",
        name: "PHARMACIE NAVEAU",
        address1: "2 ROUTE DE SAINT WANDRILLE",
        zipCode: "76480",
        city: "SAINTE-MARGUERITE-SUR-DUCLAIR",
        phoneNumber: "0235000000",
      },
    ]);

    await searchClients({ query: "nav", size: undefined, offset: undefined }, authExtra());

    expect(requests[2]).toBe(
      "https://api.frontline.galien.preprod.webhelpmedica.com/api/v1/clients?size=1000&offset=0",
    );
  });

  it("filters clients locally and paginates matching results", async () => {
    installSearchFetchMock([
      {
        id: 14,
        cipCode: "2000531",
        name: "PHARMACIE COILLIOT CUZON",
        address1: "9 RUE DE LA REPUBLIQUE",
        zipCode: "27370",
        city: "AMFREVILLE LA CAMPAGNE",
        phoneNumber: "0232353034",
      },
      {
        id: 21005,
        cipCode: "2257878",
        name: "PHARMACIE NAVEAU",
        address1: "2 ROUTE DE SAINT WANDRILLE",
        zipCode: "76480",
        city: "SAINTE-MARGUERITE-SUR-DUCLAIR",
        phoneNumber: "0235000000",
      },
      {
        id: 22273,
        cipCode: "2012843",
        name: "GRANDE PHARMACIE DES DRAKKARS",
        address1: "3 RUE DE NAVARRE",
        zipCode: "14123",
        city: "CORMELLES-LE-ROYAL",
        phoneNumber: "0231000000",
      },
    ]);

    const result = await searchClients({ query: "nav", size: 1, offset: 1 }, authExtra());

    expect(result.structuredContent).toMatchObject({
      query: "nav",
      size: 1,
      offset: 1,
      total: 2,
      scanned: 3,
      data: [
        {
          id: 22273,
          name: "GRANDE PHARMACIE DES DRAKKARS",
        },
      ],
    });
  });
});
