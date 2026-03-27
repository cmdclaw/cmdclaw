import { describe, expect, it } from "vitest";
import { getAdminEmails, normalizeAdminEmail, shouldGrantAdminRole } from "./admin-emails";

describe("admin-emails", () => {
  it("normalizes emails for admin access checks", () => {
    expect(shouldGrantAdminRole("  BAPTISTE@HEYBAP.COM ")).toBe(true);
  });

  it("normalizes emails consistently", () => {
    expect(normalizeAdminEmail("  BAPTISTE@HEYBAP.COM ")).toBe("baptiste@heybap.com");
  });

  it("returns the configured built-in admin emails", () => {
    expect(getAdminEmails()).toEqual(["baptiste@heybap.com"]);
  });
});
