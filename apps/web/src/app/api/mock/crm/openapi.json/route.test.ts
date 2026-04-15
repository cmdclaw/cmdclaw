import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/mock/crm/openapi.json", () => {
  it("returns an OpenAPI document rooted at the forwarded origin", async () => {
    const response = await GET(
      new Request("https://localcan.baptistecolle.com/api/mock/crm/openapi.json", {
        headers: {
          "x-forwarded-host": "demo.localcan.dev",
          "x-forwarded-proto": "https",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.openapi).toBe("3.1.0");
    expect(body.servers).toEqual([{ url: "https://demo.localcan.dev/api/mock/crm" }]);
    expect(body.components.securitySchemes).toBeUndefined();
    expect(body.paths["/contacts"].get.security).toBeUndefined();
    expect(
      body.paths["/contacts/{id}"].patch.requestBody.content["application/json"].schema,
    ).toEqual({ $ref: "#/components/schemas/UpdateContactInput" });
    expect(body.paths["/deals"].post.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/CreateDealInput",
    });
  });
});
