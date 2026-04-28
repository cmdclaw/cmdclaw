import { describe, expect, it } from "vitest";
import { resolveGatewayPublicOrigin } from "./public-origin";

describe("resolveGatewayPublicOrigin", () => {
  it("uses the explicit public origin header", () => {
    const request = new Request("http://127.0.0.1:3010/galien/mcp", {
      headers: {
        "x-cmdclaw-public-origin": "https://cmdclaw-mcp-03.beta.localcan.dev",
      },
    });

    expect(resolveGatewayPublicOrigin(request)).toBe(
      "https://cmdclaw-mcp-03.beta.localcan.dev",
    );
  });

  it("uses forwarded host and protocol headers", () => {
    const request = new Request("http://127.0.0.1:3010/galien/mcp", {
      headers: {
        "x-forwarded-host": "cmdclaw-mcp-03.beta.localcan.dev",
        "x-forwarded-proto": "https",
      },
    });

    expect(resolveGatewayPublicOrigin(request)).toBe(
      "https://cmdclaw-mcp-03.beta.localcan.dev",
    );
  });

  it("defaults LocalCan hosts to HTTPS when no forwarded protocol is available", () => {
    const request = new Request("http://cmdclaw-mcp-03.beta.localcan.dev/galien/mcp");

    expect(resolveGatewayPublicOrigin(request)).toBe(
      "https://cmdclaw-mcp-03.beta.localcan.dev",
    );
  });
});
