export function parseSkillContent(content: string): {
  name: string;
  description: string;
  body: string;
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    return { name: "", description: "", body: content };
  }

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  const nameMatch = frontmatter.match(/^name:\s*(.*)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.*)$/m);

  return {
    name: nameMatch ? nameMatch[1].trim() : "",
    description: descMatch ? descMatch[1].trim() : "",
    body: body.trim(),
  };
}

export function serializeSkillContent(name: string, description: string, body: string): string {
  return `---
name: ${name}
description: ${description}
---

${body}`;
}
