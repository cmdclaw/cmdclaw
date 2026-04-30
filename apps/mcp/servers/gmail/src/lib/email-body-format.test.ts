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
});
