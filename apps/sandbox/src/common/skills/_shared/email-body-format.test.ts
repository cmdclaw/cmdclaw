import { describe, expect, it } from "vitest";
import { prepareEmailHtmlBody } from "./email-body-format";

describe("prepareEmailHtmlBody", () => {
  it("escapes plain text and converts newlines to br", () => {
    const result = prepareEmailHtmlBody("Hello team\nThanks & regards");
    expect(result.html).toBe("Hello team<br>Thanks &amp; regards");
  });

  it("converts escaped newline sequences to br", () => {
    const result = prepareEmailHtmlBody("Hello team\\nThanks\\r\\nRegards\\rDone");
    expect(result.html).toBe("Hello team<br>Thanks<br>Regards<br>Done");
  });

  it("keeps allowed tags unchanged", () => {
    const input = "<p>Hello <strong>team</strong><br><i>Thanks</i></p>";
    const result = prepareEmailHtmlBody(input);
    expect(result.html).toBe(input);
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

  it("converts newlines in bodies with allowed html tags", () => {
    const result = prepareEmailHtmlBody("Hello <strong>team</strong>\\nThanks\nRegards");
    expect(result.html).toBe("Hello <strong>team</strong><br>Thanks<br>Regards");
  });

  it("rejects unsupported tags", () => {
    expect(() => prepareEmailHtmlBody("<p>Hello</p><div>x</div>")).toThrow(
      "unsupported tag <div>",
    );
  });

  it("rejects attributes on allowed tags", () => {
    expect(() => prepareEmailHtmlBody('<p class="x">Hello</p>')).toThrow(
      "attributes are not allowed on <p>",
    );
  });

  it("rejects malformed html", () => {
    expect(() => prepareEmailHtmlBody("<p>Hello")).toThrow("unclosed <p> tag");
    expect(() => prepareEmailHtmlBody("<p>Hello</strong>")).toThrow(
      "malformed closing tag </strong>",
    );
  });

  it("converts markdown links to readable text without unsupported anchor tags", () => {
    const result = prepareEmailHtmlBody("**bold** and _italic_ and [x](https://example.com)");
    expect(result.html).toBe(
      "<strong>bold</strong> and <em>italic</em> and x (https://example.com)",
    );
  });
});
