import { describe, expect, it } from "vitest";
import { prepareEmailHtmlBody } from "./email-body-format";

describe("prepareEmailHtmlBody", () => {
  it("escapes plain text and converts real newlines to br", () => {
    const result = prepareEmailHtmlBody("Hello team\nThanks & regards");
    expect(result.html).toBe("Hello team<br>Thanks &amp; regards");
  });

  it("converts escaped newline sequences to br", () => {
    const result = prepareEmailHtmlBody("Hello team\\nThanks\\r\\nRegards\\rDone");
    expect(result.html).toBe("Hello team<br>Thanks<br>Regards<br>Done");
  });

  it("converts newlines in bodies with allowed html tags", () => {
    const result = prepareEmailHtmlBody("Hello <strong>team</strong>\\nThanks\nRegards");
    expect(result.html).toBe("Hello <strong>team</strong><br>Thanks<br>Regards");
  });

  it("renders common markdown syntax for plain text bodies", () => {
    const result = prepareEmailHtmlBody(
      "### Follow-Up Meeting Scheduling Details\n*Please schedule the following calendar invites based on the call:*\n* **Meeting 1:** 2-hour deep-dive\n**Subject:** Next Steps",
    );

    expect(result.html).toBe(
      "<strong>Follow-Up Meeting Scheduling Details</strong><br><em>Please schedule the following calendar invites based on the call:</em><br>- <strong>Meeting 1:</strong> 2-hour deep-dive<br><strong>Subject:</strong> Next Steps",
    );
  });
});
