import { describe, expect, test } from "vitest";
import {
  buildUnipileBaseUrl,
  normalizeLinkedInCompanyIdentifier,
  normalizeLinkedInProfileIdentifier,
} from "./linkedin";
import { runSkillCli } from "../../_test-utils/run-skill-cli";

describe("linkedin CLI", () => {
  test("prints help text when auth env is missing", () => {
    const result = runSkillCli("sandbox/src/common/skills/linkedin/src/linkedin.ts", ["--help"], {
      UNIPILE_API_KEY: "",
      UNIPILE_DSN: "",
      LINKEDIN_ACCOUNT_ID: "",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Commands");
  });

  test("prints help text when auth env is provided", () => {
    const result = runSkillCli("sandbox/src/common/skills/linkedin/src/linkedin.ts", ["--help"], {
      UNIPILE_API_KEY: "test-token",
      UNIPILE_DSN: "https://api1.unipile.com:13111",
      LINKEDIN_ACCOUNT_ID: "linkedin-account",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("LinkedIn CLI (via Unipile) - Commands");
  });

  test("normalizes LinkedIn public profile identifiers from URLs", () => {
    expect(
      normalizeLinkedInProfileIdentifier("https://www.linkedin.com/in/eric-djavid-2154b991/"),
    ).toBe("eric-djavid-2154b991");
    expect(normalizeLinkedInProfileIdentifier("chrisscholly")).toBe("chrisscholly");
  });

  test("normalizes LinkedIn company identifiers from URLs", () => {
    expect(normalizeLinkedInCompanyIdentifier("https://www.linkedin.com/company/openai/")).toBe(
      "openai",
    );
    expect(normalizeLinkedInCompanyIdentifier("openai")).toBe("openai");
  });

  test("builds a stable Unipile base URL from raw DSN values", () => {
    expect(buildUnipileBaseUrl("api1.unipile.com:13111")).toBe(
      "https://api1.unipile.com:13111/api/v1",
    );
    expect(buildUnipileBaseUrl("https://api1.unipile.com:13111/")).toBe(
      "https://api1.unipile.com:13111/api/v1",
    );
  });
});
