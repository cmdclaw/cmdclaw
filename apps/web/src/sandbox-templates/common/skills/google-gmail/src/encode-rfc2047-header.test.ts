import { describe, expect, test } from "vitest";
import { encodeRfc2047HeaderValue } from "./encode-rfc2047-header";

describe("encodeRfc2047HeaderValue", () => {
  test("returns ASCII subject as-is", () => {
    expect(encodeRfc2047HeaderValue("Weekly inbox summary")).toBe("Weekly inbox summary");
  });

  test("encodes non-ASCII subject using RFC 2047 UTF-8 base64", () => {
    expect(encodeRfc2047HeaderValue("Résumé inbox — Semaine du 1 mars 2026")).toBe(
      "=?UTF-8?B?UsOpc3Vtw6kgaW5ib3gg4oCUIFNlbWFpbmUgZHUgMSBtYXJzIDIwMjY=?=",
    );
  });

  test("sanitizes CRLF to prevent header injection", () => {
    expect(encodeRfc2047HeaderValue("Hello\r\nBcc: someone@example.com")).toBe(
      "Hello Bcc: someone@example.com",
    );
  });
});
