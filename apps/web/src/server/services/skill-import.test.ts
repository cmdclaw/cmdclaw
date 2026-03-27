import { skill, skillDocument, skillFile } from "@cmdclaw/db/schema";
import { zipSync, strToU8 } from "fflate";
import { Buffer } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureBucketMock, generateStorageKeyMock, uploadToS3Mock } = vi.hoisted(() => ({
  ensureBucketMock: vi.fn(),
  generateStorageKeyMock: vi.fn(),
  uploadToS3Mock: vi.fn(),
}));

vi.mock("@cmdclaw/core/server/storage/s3-client", () => ({
  ensureBucket: ensureBucketMock,
  generateStorageKey: generateStorageKeyMock,
  uploadToS3: uploadToS3Mock,
}));

import { importSkill } from "./skill-import";

function createDatabase(existingNames: string[] = []) {
  const insertedSkills: Array<Record<string, unknown>> = [];
  const insertedFiles: Array<Array<Record<string, unknown>>> = [];
  const insertedDocuments: Array<Array<Record<string, unknown>>> = [];

  const tx = {
    insert: vi.fn((table: unknown) => {
      if (table === skill) {
        return {
          values: (values: Record<string, unknown>) => ({
            returning: async () => {
              const row = { id: "skill-1", ...values };
              insertedSkills.push(row);
              return [row];
            },
          }),
        };
      }

      if (table === skillFile) {
        return {
          values: async (values: Array<Record<string, unknown>>) => {
            insertedFiles.push(values);
          },
        };
      }

      if (table === skillDocument) {
        return {
          values: async (values: Array<Record<string, unknown>>) => {
            insertedDocuments.push(values);
          },
        };
      }

      throw new Error("Unexpected table");
    }),
  };

  const db = {
    query: {
      skill: {
        findMany: vi.fn(async () => existingNames.map((name) => ({ name }))),
      },
    },
    transaction: vi.fn(
      async (callback: (input: typeof tx) => Promise<unknown>) => await callback(tx),
    ),
  };

  return {
    db,
    insertedSkills,
    insertedFiles,
    insertedDocuments,
  };
}

function encodeZip(files: Record<string, Uint8Array | string>) {
  const entries = Object.fromEntries(
    Object.entries(files).map(([filePath, content]) => [
      filePath,
      typeof content === "string" ? strToU8(content) : content,
    ]),
  );
  return Buffer.from(zipSync(entries)).toString("base64");
}

describe("importSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateStorageKeyMock.mockImplementation(
      (_userId: string, skillId: string, filename: string) => `skills/${skillId}/${filename}`,
    );
  });

  it("imports a root-level zip with text files and binary assets", async () => {
    const database = createDatabase();
    const result = await importSkill(database.db as never, "user-1", {
      mode: "zip",
      filename: "weekly-report.zip",
      contentBase64: encodeZip({
        "SKILL.md": `---
name: weekly-report
description: Build a weekly report
---

# Weekly Report
`,
        "templates/report.md": "# Template\n",
        "assets/logo.png": new Uint8Array([137, 80, 78, 71]),
      }),
    });

    expect(result).toEqual({
      id: "skill-1",
      name: "weekly-report",
      displayName: "weekly-report",
      description: "Build a weekly report",
      enabled: false,
    });
    expect(database.insertedSkills[0]).toMatchObject({
      name: "weekly-report",
      displayName: "weekly-report",
      enabled: false,
    });
    expect(database.insertedFiles[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "SKILL.md" }),
        expect.objectContaining({ path: "templates/report.md" }),
      ]),
    );
    expect(database.insertedDocuments[0]).toEqual([
      expect.objectContaining({
        filename: "logo.png",
        path: "assets/logo.png",
        mimeType: "image/png",
      }),
    ]);
    expect(uploadToS3Mock).toHaveBeenCalledWith(
      expect.stringContaining("logo.png"),
      expect.any(Buffer),
      "image/png",
    );
  });

  it("strips a single top-level folder from zip imports", async () => {
    const database = createDatabase();

    const result = await importSkill(database.db as never, "user-1", {
      mode: "zip",
      filename: "weekly-report.zip",
      contentBase64: encodeZip({
        "weekly-report/SKILL.md": `---
name: weekly-report
description: Build a weekly report
---

# Weekly Report
`,
        "weekly-report/references/checklist.txt": "ship it",
      }),
    });

    expect(result.name).toBe("weekly-report");
    expect(database.insertedFiles[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "SKILL.md" }),
        expect.objectContaining({ path: "references/checklist.txt" }),
      ]),
    );
  });

  it("creates a suffixed copy when the skill slug already exists", async () => {
    const database = createDatabase(["weekly-report"]);

    const result = await importSkill(database.db as never, "user-1", {
      mode: "folder",
      files: [
        {
          path: "SKILL.md",
          mimeType: "text/markdown",
          contentBase64: Buffer.from(`---
name: weekly-report
description: Build a weekly report
---

# Weekly Report
`).toString("base64"),
        },
      ],
    });

    expect(result.name).toBe("weekly-report-2");
    expect(result.displayName).toBe("weekly-report");
  });

  it("uses frontmatter name for displayName instead of placeholder headings", async () => {
    const database = createDatabase();

    const result = await importSkill(database.db as never, "user-1", {
      mode: "folder",
      files: [
        {
          path: "SKILL.md",
          mimeType: "text/markdown",
          contentBase64: Buffer.from(`---
name: qa
description: Test and fix bugs
---

# {Title}

Real content here.
`).toString("base64"),
        },
      ],
    });

    expect(result.name).toBe("qa");
    expect(result.displayName).toBe("qa");
    expect(database.insertedSkills[0]).toMatchObject({
      name: "qa",
      displayName: "qa",
    });
  });

  it("imports multiline descriptions from YAML block scalars", async () => {
    const database = createDatabase();

    const result = await importSkill(database.db as never, "user-1", {
      mode: "folder",
      files: [
        {
          path: "SKILL.md",
          mimeType: "text/markdown",
          contentBase64: Buffer.from(`---
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
`).toString("base64"),
        },
      ],
    });

    expect(result.description).toBe(
      "Systematically QA test a web application and fix bugs found.\nProduces before/after health scores.",
    );
    expect(database.insertedSkills[0]).toMatchObject({
      description:
        "Systematically QA test a web application and fix bugs found.\nProduces before/after health scores.",
    });
  });

  it("rejects traversal paths in folder imports", async () => {
    const database = createDatabase();

    await expect(
      importSkill(database.db as never, "user-1", {
        mode: "folder",
        files: [
          {
            path: "../SKILL.md",
            mimeType: "text/markdown",
            contentBase64: Buffer.from("oops").toString("base64"),
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
