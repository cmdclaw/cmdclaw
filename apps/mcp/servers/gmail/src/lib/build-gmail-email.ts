import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { prepareEmailHtmlBody } from "./email-body-format";
import { encodeRfc2047HeaderValue } from "./encode-rfc2047-header";

type GmailAttachment = {
  content: Buffer;
  filename: string;
  mimeType: string;
};

export type BuildRawEmailParams = {
  attachmentPaths?: string[];
  body: string;
  cc?: string;
  subject: string;
  to: string;
};

function chunkBase64(input: string): string {
  return input.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function sanitizeFilename(filename: string): string {
  return filename.replaceAll(/["\r\n]/g, "_");
}

function encodeBase64Part(content: Buffer | string): string {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  return chunkBase64(buffer.toString("base64"));
}

export function inferAttachmentMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".csv":
      return "text/csv";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".gif":
      return "image/gif";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".json":
      return "application/json";
    case ".md":
    case ".txt":
      return "text/plain";
    case ".ods":
      return "application/vnd.oasis.opendocument.spreadsheet";
    case ".odt":
      return "application/vnd.oasis.opendocument.text";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".rtf":
      return "application/rtf";
    case ".webp":
      return "image/webp";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

async function readAttachment(filePath: string): Promise<GmailAttachment> {
  try {
    const content = await readFile(filePath);
    return {
      content,
      filename: sanitizeFilename(basename(filePath)),
      mimeType: inferAttachmentMimeType(filePath),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read attachment "${filePath}": ${detail}`, {
      cause: error,
    });
  }
}

function buildEmailSource(params: {
  attachments: GmailAttachment[];
  cc?: string;
  html: string;
  subject: string;
  to: string;
}): string {
  const { attachments, cc, html, subject, to } = params;
  const headers = [`To: ${to}`];
  if (cc) {
    headers.push(`Cc: ${cc}`);
  }
  headers.push(`Subject: ${subject}`, "MIME-Version: 1.0");

  if (attachments.length === 0) {
    return [
      ...headers,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeBase64Part(html),
    ].join("\r\n");
  }

  const boundary = `cmdclaw-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const sections = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64Part(html),
    "",
  ];

  for (const attachment of attachments) {
    sections.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      encodeBase64Part(attachment.content),
      "",
    );
  }

  sections.push(`--${boundary}--`);
  return sections.join("\r\n");
}

export async function buildRawEmail(params: BuildRawEmailParams): Promise<string> {
  const attachmentPaths = params.attachmentPaths?.filter(Boolean) ?? [];
  const attachments = await Promise.all(attachmentPaths.map((path) => readAttachment(path)));
  const { html } = prepareEmailHtmlBody(params.body);
  const source = buildEmailSource({
    attachments,
    cc: params.cc,
    html,
    subject: encodeRfc2047HeaderValue(params.subject),
    to: params.to,
  });

  return Buffer.from(source, "utf8").toString("base64url");
}
