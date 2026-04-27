import { describe, expect, it } from "vitest";
import {
  getBrandfetchDomainFromEndpoint,
  inferBrandNameFromDomain,
  inferBrandNameFromEndpoint,
} from "./brandfetch";

describe("brandfetch helpers", () => {
  it("reduces MCP endpoints to their brand domain", () => {
    expect(getBrandfetchDomainFromEndpoint("https://mcp.linear.app/mcp")).toBe("linear.app");
    expect(getBrandfetchDomainFromEndpoint("https://api.hubspot.com")).toBe("hubspot.com");
  });

  it("infers a display name from common domains", () => {
    expect(inferBrandNameFromDomain("linear.app")).toBe("Linear");
    expect(inferBrandNameFromDomain("salesforce.com")).toBe("Salesforce");
    expect(inferBrandNameFromDomain("foo-bar.co.uk")).toBe("Foo Bar");
  });

  it("infers a display name directly from an endpoint", () => {
    expect(inferBrandNameFromEndpoint("https://mcp.linear.app/mcp")).toBe("Linear");
  });
});
