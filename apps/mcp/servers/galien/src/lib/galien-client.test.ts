import { describe, expect, it } from "vitest";
import {
  buildGalienUrl,
  extractBearerTokenFromLoginResponse,
  splitGalienRequestParts,
} from "./galien-client";

describe("galien client helpers", () => {
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
