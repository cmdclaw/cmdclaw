import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGalienUrl,
  decodeGalienCurrentUserFromBearerToken,
  extractBearerTokenFromLoginResponse,
  requestGalienForCurrentUser,
  requestGalienForCurrentUserPathParam,
  splitGalienRequestParts,
} from "./galien-client";

describe("galien client helpers", () => {
  const originalFetch = globalThis.fetch;
  const originalEmail = process.env.GALIEN_EMAIL;
  const originalPassword = process.env.GALIEN_PASSWORD;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEmail === undefined) {
      delete process.env.GALIEN_EMAIL;
    } else {
      process.env.GALIEN_EMAIL = originalEmail;
    }
    if (originalPassword === undefined) {
      delete process.env.GALIEN_PASSWORD;
    } else {
      process.env.GALIEN_PASSWORD = originalPassword;
    }
    vi.restoreAllMocks();
  });

  it("builds Galien URLs with path params and repeated query params", () => {
    const url = buildGalienUrl(
      "/api/v1/clients/{clientId}/reports",
      { clientId: 42 },
      { size: 10, filters: ["city", "zipCode"] },
    );

    expect(url.toString()).toBe(
      "https://api.frontline.galien.preprod.webhelpmedica.com/api/v1/clients/42/reports?size=10&filters=city&filters=zipCode",
    );
  });

  it("extracts the bearer token from the login response headers", () => {
    const response = new Response("[]", {
      status: 200,
      headers: {
        authorization: "Bearer token-123",
      },
    });

    expect(extractBearerTokenFromLoginResponse(response)).toBe("Bearer token-123");
  });

  it("decodes the current user from the Galien login JWT", () => {
    const header = Buffer.from(JSON.stringify({ typ: "JWT", alg: "RS256" })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({
        id: 2,
        role: "ROLE_USER",
        firstName: "First",
        lastName: "Last",
        username: "user@example.com",
        iat: 100,
        exp: 200,
      }),
    ).toString("base64url");

    expect(decodeGalienCurrentUserFromBearerToken(`Bearer ${header}.${payload}.signature`)).toEqual({
      id: 2,
      role: "ROLE_USER",
      firstName: "First",
      lastName: "Last",
      username: "user@example.com",
      iat: 100,
      exp: 200,
    });
  });

  it("injects the current user id as a query param for non-user paths", async () => {
    const header = Buffer.from(JSON.stringify({ typ: "JWT", alg: "RS256" })).toString(
      "base64url",
    );
    const payload = Buffer.from(JSON.stringify({ id: 2, role: "ROLE_USER" })).toString(
      "base64url",
    );
    const bearerToken = `Bearer ${header}.${payload}.signature`;
    const requests: string[] = [];

    process.env.GALIEN_EMAIL = "user@example.com";
    process.env.GALIEN_PASSWORD = "password";
    globalThis.fetch = vi.fn(async (input, init) => {
      requests.push(String(input));

      if (String(input).endsWith("/api/v1/tokens/login")) {
        expect(init?.method).toBe("POST");
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
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as unknown as typeof fetch;

    await requestGalienForCurrentUser({
      method: "GET",
      path: "/api/v1/reclamations",
      query: {
        clientId: 42,
      },
    });

    expect(requests[1]).toBe(
      "https://api.frontline.galien.preprod.webhelpmedica.com/api/v1/reclamations?clientId=42&userId=2",
    );
  });

  it("injects the current user id into a named path parameter", async () => {
    const header = Buffer.from(JSON.stringify({ typ: "JWT", alg: "RS256" })).toString(
      "base64url",
    );
    const payload = Buffer.from(JSON.stringify({ id: 2, role: "ROLE_USER" })).toString(
      "base64url",
    );
    const bearerToken = `Bearer ${header}.${payload}.signature`;
    const requests: string[] = [];

    process.env.GALIEN_EMAIL = "user@example.com";
    process.env.GALIEN_PASSWORD = "password";
    globalThis.fetch = vi.fn(async (input, init) => {
      requests.push(String(input));

      if (String(input).endsWith("/api/v1/tokens/login")) {
        expect(init?.method).toBe("POST");
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
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as unknown as typeof fetch;

    await requestGalienForCurrentUserPathParam(
      {
        method: "GET",
        path: "/api/v1/clients/{clientId}/appointments",
        query: {
          size: 50,
          offset: 0,
          startDate: "2026-05-01T00:00:00.000Z",
          endDate: "2026-06-30T23:59:59.999Z",
        },
      },
      "clientId",
    );

    expect(requests[1]).toBe(
      "https://api.frontline.galien.preprod.webhelpmedica.com/api/v1/clients/2/appointments?size=50&offset=0&startDate=2026-05-01T00%3A00%3A00.000Z&endDate=2026-06-30T23%3A59%3A59.999Z",
    );
  });

  it("splits path params from query params", () => {
    expect(
      splitGalienRequestParts("/api/v1/clients/{clientId}/reports", {
        clientId: 42,
        size: 10,
        filters: ["city", "zipCode"],
      }),
    ).toEqual({
      pathParams: { clientId: 42 },
      query: {
        size: 10,
        filters: ["city", "zipCode"],
      },
    });
  });
});
