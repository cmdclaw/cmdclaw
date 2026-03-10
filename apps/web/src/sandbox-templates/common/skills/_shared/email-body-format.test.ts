import { describe, expect, it } from "vitest";
import { prepareEmailHtmlBody } from "./email-body-format";

describe("prepareEmailHtmlBody", () => {
  it("escapes plain text and converts newlines to br", () => {
    const result = prepareEmailHtmlBody("Hello team\nThanks & regards");
    expect(result.html).toBe("Hello team<br>Thanks &amp; regards");
  });

  it("keeps allowed tags unchanged", () => {
    const input = "<p>Hello <strong>team</strong><br><i>Thanks</i></p>";
    const result = prepareEmailHtmlBody(input);
    expect(result.html).toBe(input);
  });

  it("rejects unsupported tags", () => {
    expect(() => prepareEmailHtmlBody("<p>Hello</p><table><tr><td>x</td></tr></table>")).toThrow(
      "unsupported tag <table>",
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

  it("keeps markdown literal", () => {
    const result = prepareEmailHtmlBody("**bold** and _italic_ and [x](https://example.com)");
    expect(result.html).toBe("**bold** and _italic_ and [x](https://example.com)");
  });
});
