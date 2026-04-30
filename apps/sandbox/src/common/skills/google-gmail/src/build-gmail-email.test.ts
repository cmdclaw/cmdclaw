import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildRawEmail, inferAttachmentMimeType } from "./build-gmail-email";

describe("buildRawEmail", () => {
  test("builds an html email when no attachments are provided", async () => {
    const raw = await buildRawEmail({
      body: "<p>Hello</p>",
      subject: "Hello",
      to: "user@example.com",
    });

    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("Content-Type: text/html; charset=utf-8");
    expect(decoded).toContain("Content-Transfer-Encoding: base64");
    expect(decoded).not.toContain("multipart/mixed");
  });

  test("converts escaped newline sequences in plain text bodies", async () => {
    const raw = await buildRawEmail({
      body: "Hello team\\nThanks\\r\\nRegards",
      subject: "Hello",
      to: "user@example.com",
    });

    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain(Buffer.from("Hello team<br>Thanks<br>Regards").toString("base64"));
  });

  test("builds a multipart email when attachment paths are provided", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "gmail-attachment-"));
    const attachmentPath = path.join(tempDir, "report.pdf");
    writeFileSync(attachmentPath, "%PDF-1.4 fake");

    const raw = await buildRawEmail({
      attachmentPaths: [attachmentPath],
      body: "<p>Please review the attached report.</p>",
      cc: "manager@example.com",
      subject: "Quarterly report",
      to: "user@example.com",
    });

    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("Content-Type: multipart/mixed; boundary=");
    expect(decoded).toContain("Cc: manager@example.com");
    expect(decoded).toContain('Content-Type: application/pdf; name="report.pdf"');
    expect(decoded).toContain('Content-Disposition: attachment; filename="report.pdf"');
    expect(decoded).toContain(Buffer.from("%PDF-1.4 fake").toString("base64"));
  });
});

describe("inferAttachmentMimeType", () => {
  test("recognizes common office document types", () => {
    expect(inferAttachmentMimeType("/tmp/brief.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(inferAttachmentMimeType("/tmp/forecast.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(inferAttachmentMimeType("/tmp/deck.pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
  });
});
