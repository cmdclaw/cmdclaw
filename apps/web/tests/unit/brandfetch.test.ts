import { describe, expect, test } from "vitest";
import { getBrandfetchDomainFromEndpoint, getBrandfetchLogoUrl } from "@/lib/brandfetch";

describe("brandfetch", () => {
  test("derives the brand domain from common MCP subdomains", () => {
    expect(getBrandfetchDomainFromEndpoint("https://mcp.linear.app/mcp")).toBe("linear.app");
    expect(getBrandfetchDomainFromEndpoint("https://api.notion.so/v1")).toBe("notion.so");
  });

  test("keeps country-code domains intact", () => {
    expect(getBrandfetchDomainFromEndpoint("https://api.example.co.uk/mcp")).toBe("example.co.uk");
  });

  test("returns null for local endpoints", () => {
    expect(getBrandfetchDomainFromEndpoint("http://localhost:3000/mcp")).toBeNull();
    expect(getBrandfetchLogoUrl("http://127.0.0.1:8787/mcp")).toBeNull();
  });

  test("builds a Brandfetch CDN icon URL", () => {
    expect(getBrandfetchLogoUrl("https://mcp.linear.app/mcp")).toBe(
      "https://cdn.brandfetch.io/linear.app/w/80/h/80/icon.png?c=1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa",
    );
  });
});
