import { Suspense } from "react";
import { listTemplateCatalogEntries } from "@/server/services/template-catalog";
import { TemplatesPageClient } from "./templates-page-client";

export default async function TemplatesPage() {
  const templates = await listTemplateCatalogEntries();

  return (
    <Suspense fallback={null}>
      <TemplatesPageClient templates={templates} />
    </Suspense>
  );
}
