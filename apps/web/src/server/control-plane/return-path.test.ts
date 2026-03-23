import { describe, expect, it } from "vitest";
import { sanitizeReturnPath } from "./return-path";

describe("sanitizeReturnPath", () => {
  it("allows safe app-relative paths", () => {
    expect(sanitizeReturnPath("/chat/123?tab=files#latest")).toBe("/chat/123?tab=files#latest");
  });

  it("rejects login routes to prevent auth redirect loops", () => {
    expect(sanitizeReturnPath("/login?callbackUrl=%2Fchat", "/chat")).toBe("/chat");
  });

  it("rejects auth callback routes as return targets", () => {
    expect(sanitizeReturnPath("/api/control-plane/auth/callback?code=123", "/chat")).toBe("/chat");
    expect(sanitizeReturnPath("/api/instance/auth/start?callbackUrl=%2Fchat", "/chat")).toBe(
      "/chat",
    );
    expect(sanitizeReturnPath("/api/auth/sign-in/social", "/chat")).toBe("/chat");
  });

  it("rejects external and protocol-relative paths", () => {
    expect(sanitizeReturnPath("https://example.com/chat", "/chat")).toBe("/chat");
    expect(sanitizeReturnPath("//example.com/chat", "/chat")).toBe("/chat");
  });
});
