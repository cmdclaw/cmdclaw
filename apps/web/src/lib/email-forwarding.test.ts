import {
  buildUserForwardingAddress,
  buildCoworkerForwardingAddress,
  extractEmailAddress,
  generateCoworkerAliasLocalPart,
  parseForwardingTargetFromEmail,
} from "@bap/core/lib/email-forwarding";
import { describe, expect, it } from "vitest";

describe("email-forwarding", () => {
  it("builds coworker and user forwarding aliases", () => {
    expect(buildCoworkerForwardingAddress("beaver-strong-orange", "Mail.heybap.com")).toBe(
      "bot+beaver-strong-orange@mail.heybap.com",
    );

    expect(buildUserForwardingAddress("user-123", "mail.heybap.com")).toBe(
      "bot+u_user-123@mail.heybap.com",
    );
  });

  it("extracts sender email from RFC-like display names", () => {
    expect(extractEmailAddress("Bap User <Test@Example.com>")).toBe("test@example.com");
    expect(extractEmailAddress("test@example.com")).toBe("test@example.com");
    expect(extractEmailAddress("")).toBeNull();
    expect(extractEmailAddress(undefined)).toBeNull();
  });

  it("parses coworker and user aliases from recipient emails", () => {
    expect(
      parseForwardingTargetFromEmail("bot+beaver-strong-orange@mail.heybap.com", "mail.heybap.com"),
    ).toEqual({
      kind: "coworker_alias",
      localPart: "beaver-strong-orange",
    });

    expect(
      parseForwardingTargetFromEmail("bot+u_user-123@mail.heybap.com", "mail.heybap.com"),
    ).toEqual({
      kind: "user",
      id: "user-123",
    });
  });

  it("rejects the bare default mailbox local-part", () => {
    expect(parseForwardingTargetFromEmail("bot@mail.heybap.com", "mail.heybap.com")).toBeNull();
  });

  it("generates human-friendly coworker alias local-part", () => {
    const value = generateCoworkerAliasLocalPart();
    expect(value).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/);
  });

  it("rejects unknown domains and local parts", () => {
    expect(
      parseForwardingTargetFromEmail("bot+beaver-strong-orange@other.com", "mail.heybap.com"),
    ).toBeNull();
    expect(parseForwardingTargetFromEmail("bot+@mail.heybap.com", "mail.heybap.com")).toBeNull();
  });
});
