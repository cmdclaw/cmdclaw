import { describe, expect, it } from "vitest";
import {
  extractSkillToolIntegrations,
  parseSkillContent,
  serializeSkillContent,
} from "./skill-markdown";

describe("skill-markdown", () => {
  it("parses multiline YAML block scalars for description", () => {
    const content = `---
name: qa
version: 2.0.0
description: |
  Systematically QA test a web application and fix bugs found.
  Produces before/after health scores.
allowed-tools:
  - Bash
  - Read
---

# QA
`;

    expect(parseSkillContent(content)).toEqual({
      name: "qa",
      description:
        "Systematically QA test a web application and fix bugs found.\nProduces before/after health scores.",
      body: "# QA\n",
      frontmatter: `name: qa
version: 2.0.0
description: |
  Systematically QA test a web application and fix bugs found.
  Produces before/after health scores.
allowed-tools:
  - Bash
  - Read`,
    });
  });

  it("preserves unrelated frontmatter keys when serializing", () => {
    const content = `---
name: qa
version: 2.0.0
description: |
  Systematically QA test a web application and fix bugs found.
  Produces before/after health scores.
allowed-tools:
  - Bash
  - Read
---

# QA
`;

    const parsed = parseSkillContent(content);
    const serialized = serializeSkillContent(
      parsed.name,
      parsed.description,
      parsed.body,
      parsed.frontmatter,
    );

    expect(serialized).toContain("version: 2.0.0");
    expect(serialized).toContain("allowed-tools:");
    expect(serialized).toContain("description: |");
    expect(serialized).toContain("  Produces before/after health scores.");
    expect(serialized).toContain("\n---\n\n# QA\n");
  });

  it("extracts agent-browser integration from inline allowed-tools syntax", () => {
    const content = `---
name: browser-capture
description: Capture the current page
allowed-tools: Bash(agent-browser:*)
---

# Browser capture
`;

    expect(extractSkillToolIntegrations(content)).toEqual(["agent-browser"]);
  });

  it("ignores generic tools and deduplicates extracted integrations", () => {
    const content = `---
name: mixed-skill
description: Mixed tool permissions
allowed-tools:
  - Bash
  - Read
  - Bash(agent-browser:*)
  - Bash(agent-browser:open)
---

# Mixed skill
`;

    expect(extractSkillToolIntegrations(content)).toEqual(["agent-browser"]);
  });
});
