import { templateCatalogSchema } from "@cmdclaw/db/template-catalog";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

type VitestProcedure = Extract<
  NonNullable<Parameters<typeof vi.fn>[0]>,
  (...args: never[]) => unknown
>;
import { callFollowUpTemplate, templateCatalogFixture } from "@/test/template-catalog-fixtures";
import {
  deleteTemplateCatalogEntry,
  exportTemplateCatalog,
  importTemplateCatalog,
  setTemplateCatalogEntryFeatured,
} from "./template-catalog";

function createDatabase() {
  const insertOnConflictDoUpdateMock = vi.fn<VitestProcedure>();
  const insertValuesMock = vi.fn<VitestProcedure>(() => ({
    onConflictDoUpdate: insertOnConflictDoUpdateMock,
  }));
  const insertMock = vi.fn<VitestProcedure>(() => ({ values: insertValuesMock }));

  const deleteReturningMock = vi.fn<VitestProcedure>();
  const deleteWhereMock = vi.fn<VitestProcedure>(() => ({ returning: deleteReturningMock }));
  const deleteMock = vi.fn<VitestProcedure>(() => ({ where: deleteWhereMock }));

  const updateReturningMock = vi.fn<VitestProcedure>();
  const updateWhereMock = vi.fn<VitestProcedure>(() => ({ returning: updateReturningMock }));
  const updateSetMock = vi.fn<VitestProcedure>(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn<VitestProcedure>(() => ({ set: updateSetMock }));

  const database = {
    query: {
      templateCatalog: {
        findMany: vi.fn<VitestProcedure>(),
        findFirst: vi.fn<VitestProcedure>(),
      },
    },
    insert: insertMock,
    delete: deleteMock,
    update: updateMock,
  };

  return {
    database,
    mocks: {
      insertOnConflictDoUpdateMock,
      deleteReturningMock,
      updateReturningMock,
    },
  };
}

describe("template catalog service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts imported templates by id", async () => {
    const { database, mocks } = createDatabase();
    database.query.templateCatalog.findMany.mockResolvedValue([{ id: callFollowUpTemplate.id }]);
    mocks.insertOnConflictDoUpdateMock.mockResolvedValue(undefined);

    const result = await importTemplateCatalog({
      definitionJson: JSON.stringify(templateCatalogFixture),
      database: database as never,
    });

    expect(result).toEqual({
      importedCount: 1,
      createdCount: 0,
      updatedCount: 1,
    });
    expect(database.insert).toHaveBeenCalledTimes(1);
  });

  it("treats missing ids as creates and never deletes omitted templates", async () => {
    const { database, mocks } = createDatabase();
    database.query.templateCatalog.findMany.mockResolvedValue([]);
    mocks.insertOnConflictDoUpdateMock.mockResolvedValue(undefined);

    const result = await importTemplateCatalog({
      definitionJson: JSON.stringify(templateCatalogFixture),
      database: database as never,
    });

    expect(result).toEqual({
      importedCount: 1,
      createdCount: 1,
      updatedCount: 0,
    });
    expect(database.delete).not.toHaveBeenCalled();
  });

  it("rejects malformed template catalog json", async () => {
    const { database } = createDatabase();

    await expect(
      importTemplateCatalog({
        definitionJson: "{bad json",
        database: database as never,
      }),
    ).rejects.toThrow("Template catalog JSON is not valid JSON.");
  });

  it("deletes only the targeted template", async () => {
    const { database, mocks } = createDatabase();
    mocks.deleteReturningMock.mockResolvedValue([{ id: "call-follow-up" }]);

    const deleted = await deleteTemplateCatalogEntry("call-follow-up", database as never);

    expect(deleted).toEqual({ id: "call-follow-up" });
    expect(database.delete).toHaveBeenCalledTimes(1);
  });

  it("updates featured state for the targeted template", async () => {
    const { database, mocks } = createDatabase();
    mocks.updateReturningMock.mockResolvedValue([{ id: "call-follow-up", featured: false }]);

    const updated = await setTemplateCatalogEntryFeatured({
      id: "call-follow-up",
      featured: false,
      database: database as never,
    });

    expect(updated).toEqual({ id: "call-follow-up", featured: false });
    expect(database.update).toHaveBeenCalledTimes(1);
  });

  it("exports a versioned catalog from the current rows", async () => {
    const { database } = createDatabase();
    database.query.templateCatalog.findMany.mockResolvedValue([
      {
        ...callFollowUpTemplate,
        createdAt: new Date("2026-03-28T06:30:00.000Z"),
        updatedAt: new Date("2026-03-28T06:30:00.000Z"),
      },
    ]);

    const catalog = await exportTemplateCatalog(database as never);

    expect(catalog.version).toBe(1);
    expect(catalog.templates).toEqual([callFollowUpTemplate]);
  });

  it("validates the checked-in example catalog and preserves landing-only examples", async () => {
    const raw = await readFile(
      new URL("../../../../../packages/db/src/template-catalog.examples.json", import.meta.url),
      "utf8",
    );

    const parsed = templateCatalogSchema.parse(JSON.parse(raw));

    expect(new Set(parsed.templates.map((template) => template.id)).size).toBe(
      parsed.templates.length,
    );
    expect(parsed.templates.some((template) => template.id === "daily-email-digest")).toBe(true);
  });
});
