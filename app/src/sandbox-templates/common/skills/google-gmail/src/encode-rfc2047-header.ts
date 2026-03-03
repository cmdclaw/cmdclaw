const ASCII_HEADER_VALUE = /^[\t\x20-\x7E]*$/;

function sanitizeHeaderValue(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

export function encodeRfc2047HeaderValue(value: string): string {
  const sanitized = sanitizeHeaderValue(value);
  if (sanitized.length === 0) {
    return "";
  }
  if (ASCII_HEADER_VALUE.test(sanitized)) {
    return sanitized;
  }

  const base64 = Buffer.from(sanitized, "utf8").toString("base64");
  return `=?UTF-8?B?${base64}?=`;
}
