import { db } from "@cmdclaw/db/client";
import { templateCatalog } from "@cmdclaw/db/schema";
import {
  parseTemplateCatalogJson,
  type TemplateCatalog,
  type TemplateCatalogTemplate,
} from "@cmdclaw/db/template-catalog";
import { eq, inArray } from "drizzle-orm";

type Database = typeof import("@cmdclaw/db/client").db;

function toTemplateRecord(row: typeof templateCatalog.$inferSelect): TemplateCatalogTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    triggerType: row.triggerType,
    industry: row.industry,
    useCase: row.useCase,
    integrations: row.integrations,
    triggerTitle: row.triggerTitle,
    triggerDescription: row.triggerDescription,
    agentInstructions: row.agentInstructions,
    heroCta: row.heroCta,
    summaryBlocks: row.summaryBlocks,
    mermaid: row.mermaid,
    connectedApps: row.connectedApps,
    featured: row.featured,
  };
}

export async function listTemplateCatalogEntries(
  database: Database = db,
): Promise<TemplateCatalogTemplate[]> {
  const rows = await database.query.templateCatalog.findMany({
    orderBy: (entry, { asc }) => [asc(entry.createdAt)],
  });

  return rows.map(toTemplateRecord);
}

export async function listFeaturedTemplateCatalogEntries(params?: {
  limit?: number;
  database?: Database;
}): Promise<TemplateCatalogTemplate[]> {
  const rows = await (params?.database ?? db).query.templateCatalog.findMany({
    where: eq(templateCatalog.featured, true),
    orderBy: (entry, { asc }) => [asc(entry.createdAt)],
  });

  const templates = rows.map(toTemplateRecord);
  return typeof params?.limit === "number" ? templates.slice(0, params.limit) : templates;
}

export async function getTemplateCatalogEntryById(
  id: string,
  database: Database = db,
): Promise<TemplateCatalogTemplate | null> {
  const row = await database.query.templateCatalog.findFirst({
    where: eq(templateCatalog.id, id),
  });

  return row ? toTemplateRecord(row) : null;
}

export async function exportTemplateCatalog(database: Database = db): Promise<TemplateCatalog> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    templates: await listTemplateCatalogEntries(database),
  };
}

export async function importTemplateCatalog(params: {
  definitionJson: string;
  database?: Database;
}) {
  const database = params.database ?? db;
  const catalog = parseTemplateCatalogJson(params.definitionJson);
  const ids = catalog.templates.map((entry) => entry.id);
  const existingRows =
    ids.length > 0
      ? await database.query.templateCatalog.findMany({
          where: inArray(templateCatalog.id, ids),
          columns: { id: true },
        })
      : [];
  const existingIds = new Set(existingRows.map((row) => row.id));

  await Promise.all(
    catalog.templates.map((entry) =>
      database
        .insert(templateCatalog)
        .values({
          id: entry.id,
          title: entry.title,
          description: entry.description,
          triggerType: entry.triggerType,
          industry: entry.industry,
          useCase: entry.useCase,
          integrations: entry.integrations,
          triggerTitle: entry.triggerTitle,
          triggerDescription: entry.triggerDescription,
          agentInstructions: entry.agentInstructions,
          heroCta: entry.heroCta,
          summaryBlocks: entry.summaryBlocks,
          mermaid: entry.mermaid,
          connectedApps: entry.connectedApps,
          featured: entry.featured,
        })
        .onConflictDoUpdate({
          target: templateCatalog.id,
          set: {
            title: entry.title,
            description: entry.description,
            triggerType: entry.triggerType,
            industry: entry.industry,
            useCase: entry.useCase,
            integrations: entry.integrations,
            triggerTitle: entry.triggerTitle,
            triggerDescription: entry.triggerDescription,
            agentInstructions: entry.agentInstructions,
            heroCta: entry.heroCta,
            summaryBlocks: entry.summaryBlocks,
            mermaid: entry.mermaid,
            connectedApps: entry.connectedApps,
            featured: entry.featured,
            updatedAt: new Date(),
          },
        }),
    ),
  );

  return {
    importedCount: catalog.templates.length,
    createdCount: catalog.templates.filter((entry) => !existingIds.has(entry.id)).length,
    updatedCount: catalog.templates.filter((entry) => existingIds.has(entry.id)).length,
  };
}

export async function deleteTemplateCatalogEntry(id: string, database: Database = db) {
  const deleted = await database
    .delete(templateCatalog)
    .where(eq(templateCatalog.id, id))
    .returning({ id: templateCatalog.id });

  return deleted[0] ?? null;
}

export async function setTemplateCatalogEntryFeatured(params: {
  id: string;
  featured: boolean;
  database?: Database;
}) {
  const updated = await (params.database ?? db)
    .update(templateCatalog)
    .set({
      featured: params.featured,
      updatedAt: new Date(),
    })
    .where(eq(templateCatalog.id, params.id))
    .returning({
      id: templateCatalog.id,
      featured: templateCatalog.featured,
    });

  return updated[0] ?? null;
}
