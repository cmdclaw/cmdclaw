const ALLOWED_HTML_TAGS = ["b", "strong", "i", "em", "u", "br", "p"] as const;

const ALLOWED_HTML_TAG_SET = new Set<string>(ALLOWED_HTML_TAGS);
const ALLOWED_HTML_TAGS_TEXT = ALLOWED_HTML_TAGS.join(",");

type TagToken = {
  full: string;
  name: string;
  attrs: string;
  index: number;
  isClosing: boolean;
  isSelfClosing: boolean;
};

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractHtmlTags(input: string): TagToken[] {
  const tags: TagToken[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

  for (const match of input.matchAll(tagRegex)) {
    const full = match[0];
    const name = (match[1] || "").toLowerCase();
    const attrs = match[2] || "";
    const index = match.index ?? -1;
    tags.push({
      full,
      name,
      attrs,
      index,
      isClosing: full.startsWith("</"),
      isSelfClosing: full.endsWith("/>"),
    });
  }

  return tags;
}

function throwInvalidHtml(reason: string): never {
  throw new Error(`Invalid email body HTML: ${reason}. Allowed tags: ${ALLOWED_HTML_TAGS_TEXT}`);
}

export function prepareEmailHtmlBody(input: string): { html: string } {
  if (typeof input !== "string") {
    throwInvalidHtml("body must be a string");
  }

  if (input.includes("<!--") || input.includes("-->")) {
    throwInvalidHtml("HTML comments are not allowed");
  }

  if (/<\s*\/?\s*(script|style)\b/i.test(input)) {
    throwInvalidHtml("script/style tags are not allowed");
  }

  const normalizedInput = input.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const tags = extractHtmlTags(normalizedInput);

  if (tags.length === 0) {
    return {
      html: escapeHtml(normalizedInput).replaceAll("\n", "<br>"),
    };
  }

  const withoutTags = normalizedInput.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, "");
  if (/[<>]/.test(withoutTags)) {
    throwInvalidHtml("malformed HTML tag");
  }

  const stack: string[] = [];
  for (const tag of tags) {
    if (!ALLOWED_HTML_TAG_SET.has(tag.name)) {
      throwInvalidHtml(`unsupported tag <${tag.name}>`);
    }

    const attrText = tag.attrs.trim();
    if (tag.isClosing) {
      if (attrText.length > 0) {
        throwInvalidHtml(`attributes are not allowed on </${tag.name}>`);
      }
      if (tag.name === "br") {
        throwInvalidHtml("closing </br> tag is not allowed");
      }
      const open = stack.pop();
      if (open !== tag.name) {
        throwInvalidHtml(`malformed closing tag </${tag.name}>`);
      }
      continue;
    }

    if (attrText.length > 0 && attrText !== "/") {
      throwInvalidHtml(`attributes are not allowed on <${tag.name}>`);
    }
    if (tag.isSelfClosing && tag.name !== "br") {
      throwInvalidHtml(`self-closing <${tag.name}/> tag is not allowed`);
    }
    if (tag.name !== "br") {
      stack.push(tag.name);
    }
  }

  if (stack.length > 0) {
    throwInvalidHtml(`unclosed <${stack[stack.length - 1]}> tag`);
  }

  return { html: normalizedInput };
}
