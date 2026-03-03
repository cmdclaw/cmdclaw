import { describe, expect, it } from "vitest";
import { getSandboxProvider } from "./registry";

describe("sandbox provider registry", () => {
  it("returns e2b provider", () => {
    expect(getSandboxProvider("e2b").id).toBe("e2b");
  });

  it("returns daytona provider", () => {
    expect(getSandboxProvider("daytona").id).toBe("daytona");
  });

  it("returns byoc provider", () => {
    expect(getSandboxProvider("byoc").id).toBe("byoc");
  });
});
