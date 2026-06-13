import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMagicLinkEmailPayload } from "@/lib/magic-link-email";

describe("magic-link-email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the branded email with trust signals and the sign-in landing URL", () => {
    const payload = buildMagicLinkEmailPayload(
      "https://heybap.com/sign-in/abc123",
      "pilot@heybap.com",
    );

    expect(payload.html).toContain("heybap.com/logo.png");
    expect(payload.html).toContain("#B33A3A");
    expect(payload.html).toContain("A sign-in link was requested for");
    expect(payload.html).toContain("pilot@heybap.com");
    expect(payload.html).toContain("/sign-in/abc123");
    expect(payload.html).not.toContain("/api/auth/magic-link/verify");
    expect(payload.html).not.toContain("callbackURL");
    expect(payload.html).not.toContain("s=");

    expect(payload.text).toContain("A sign-in link was requested for pilot@heybap.com.");
    expect(payload.text).toContain("This link opens on heybap.com");
    expect(payload.text).toContain("/sign-in/abc123");
    expect(payload.text).not.toContain("/api/auth/magic-link/verify");
    expect(payload.text).not.toContain("callbackURL");
    expect(payload.text).not.toContain("s=");
  });

  it("uses a public logo URL when the sign-in link is local", () => {
    const payload = buildMagicLinkEmailPayload(
      "http://localhost:3000/sign-in/abc123",
      "pilot@heybap.com",
    );

    expect(payload.html).toContain("https://heybap.com/logo.png");
    expect(payload.html).not.toContain("http://localhost:3000/logo.png");
  });
});
