export type ParsedSkillContent = {
  name: string;
  description: string;
  body: string;
  frontmatter: string;
};

type ParsedFrontmatterField = {
  start: number;
  end: number;
  value: string;
};

function splitSkillContent(content: string): { frontmatter: string; body: string } | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!frontmatterMatch) {
    return null;
  }

  return {
    frontmatter: frontmatterMatch[1],
    body: frontmatterMatch[2],
  };
}

function unquoteYamlValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function foldYamlLines(lines: string[]): string {
  const folded: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    folded.push(paragraph.join(" "));
    paragraph = [];
  };

  for (const line of lines) {
    if (line === "") {
      flushParagraph();
      folded.push("");
      continue;
    }
    paragraph.push(line);
  }

  flushParagraph();
  return folded.join("\n");
}

function parseBlockScalar(
  lines: string[],
  startIndex: number,
  indicator: string,
): { value: string; end: number } {
  let end = startIndex + 1;
  const blockLines: string[] = [];

  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() !== "" && !/^[\t ]/.test(line)) {
      break;
    }
    blockLines.push(line);
    end += 1;
  }

  const nonEmptyLines = blockLines.filter((line) => line.trim() !== "");
  const minIndent =
    nonEmptyLines.length === 0
      ? 0
      : Math.min(...nonEmptyLines.map((line) => line.match(/^[\t ]*/)![0].length));

  const normalizedLines = blockLines.map((line) => {
    if (line.trim() === "") {
      return "";
    }
    return line.slice(minIndent);
  });

  const rawValue = indicator.startsWith(">")
    ? foldYamlLines(normalizedLines)
    : normalizedLines.join("\n");

  return {
    value: rawValue.replace(/\n+$/g, ""),
    end,
  };
}

function parseFrontmatterField(frontmatter: string, key: string): ParsedFrontmatterField | null {
  const lines = frontmatter.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[\t ]/.test(line)) {
      continue;
    }

    const match = line.match(new RegExp(`^${key}:\\s*(.*)$`));
    if (!match) {
      continue;
    }

    const rawValue = match[1] ?? "";
    const trimmedValue = rawValue.trim();
    if (/^[>|][+-]?$/.test(trimmedValue)) {
      const block = parseBlockScalar(lines, index, trimmedValue);
      return {
        start: index,
        end: block.end,
        value: block.value,
      };
    }

    return {
      start: index,
      end: index + 1,
      value: unquoteYamlValue(rawValue),
    };
  }

  return null;
}

function formatYamlScalar(value: string): string {
  if (value.length === 0) {
    return '""';
  }

  if (/^[a-z0-9][a-z0-9\-_. /()]*$/i.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function formatFrontmatterField(key: string, value: string): string[] {
  if (value.includes("\n")) {
    return [`${key}: |`, ...value.split("\n").map((line) => `  ${line}`)];
  }

  return [`${key}: ${formatYamlScalar(value)}`];
}

function replaceFrontmatterField(frontmatter: string, key: string, value: string): string {
  const lines = frontmatter.length > 0 ? frontmatter.split("\n") : [];
  const existingField = parseFrontmatterField(frontmatter, key);
  const replacementLines = formatFrontmatterField(key, value);

  if (existingField) {
    lines.splice(existingField.start, existingField.end - existingField.start, ...replacementLines);
    return lines.join("\n");
  }

  return [...lines, ...replacementLines]
    .filter((line, index, all) => !(index === 0 && line === "" && all.length > 1))
    .join("\n");
}

export function parseSkillContent(content: string): ParsedSkillContent {
  const splitContent = splitSkillContent(content);

  if (!splitContent) {
    return { name: "", description: "", body: content, frontmatter: "" };
  }

  const { frontmatter, body } = splitContent;
  const nameField = parseFrontmatterField(frontmatter, "name");
  const descriptionField = parseFrontmatterField(frontmatter, "description");

  return {
    name: nameField?.value ?? "",
    description: descriptionField?.value ?? "",
    body: body.replace(/^\n/, ""),
    frontmatter,
  };
}

export function serializeSkillContent(
  name: string,
  description: string,
  body: string,
  existingFrontmatter = "",
): string {
  let nextFrontmatter = existingFrontmatter.trimEnd();
  nextFrontmatter = replaceFrontmatterField(nextFrontmatter, "name", name);
  nextFrontmatter = replaceFrontmatterField(nextFrontmatter, "description", description);

  return body.length > 0
    ? `---\n${nextFrontmatter}\n---\n\n${body}`
    : `---\n${nextFrontmatter}\n---\n`;
}
