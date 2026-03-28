import { user } from "@cmdclaw/db/schema";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  deleteTemplateCatalogEntry,
  exportTemplateCatalog,
  importTemplateCatalog,
  listTemplateCatalogEntries,
  setTemplateCatalogEntryFeatured,
} from "@/server/services/template-catalog";
import { protectedProcedure, type AuthenticatedContext } from "../middleware";

async function ensureAdmin(context: AuthenticatedContext) {
  const dbUser = await context.db.query.user.findFirst({
    where: eq(user.id, context.user.id),
    columns: { role: true },
  });

  if (dbUser?.role !== "admin") {
    throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
  }
}

const list = protectedProcedure.handler(async ({ context }) => {
  await ensureAdmin(context);
  return listTemplateCatalogEntries(context.db);
});

const exportCatalog = protectedProcedure.handler(async ({ context }) => {
  await ensureAdmin(context);
  return exportTemplateCatalog(context.db);
});

const importCatalogEndpoint = protectedProcedure
  .input(
    z.object({
      definitionJson: z.string().min(2).max(50_000_000),
    }),
  )
  .handler(async ({ input, context }) => {
    await ensureAdmin(context);
    return importTemplateCatalog({
      definitionJson: input.definitionJson,
      database: context.db,
    });
  });

const deleteEndpoint = protectedProcedure
  .input(
    z.object({
      id: z.string().min(1),
    }),
  )
  .handler(async ({ input, context }) => {
    await ensureAdmin(context);
    const deleted = await deleteTemplateCatalogEntry(input.id, context.db);

    if (!deleted) {
      throw new ORPCError("NOT_FOUND", { message: "Template not found." });
    }

    return deleted;
  });

const setFeatured = protectedProcedure
  .input(
    z.object({
      id: z.string().min(1),
      featured: z.boolean(),
    }),
  )
  .handler(async ({ input, context }) => {
    await ensureAdmin(context);
    const updated = await setTemplateCatalogEntryFeatured({
      id: input.id,
      featured: input.featured,
      database: context.db,
    });

    if (!updated) {
      throw new ORPCError("NOT_FOUND", { message: "Template not found." });
    }

    return updated;
  });

export const templateRouter = {
  list,
  exportCatalog,
  importCatalog: importCatalogEndpoint,
  delete: deleteEndpoint,
  setFeatured,
};
