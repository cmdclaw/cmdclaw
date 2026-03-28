import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TemplateDetailContent } from "@/components/template-detail-content";
import { getTemplateCatalogEntryById } from "@/server/services/template-catalog";

type PageProps = {
  params: Promise<{
    templateId: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { templateId } = await params;
  const template = await getTemplateCatalogEntryById(templateId);

  if (!template) {
    return {
      title: "Template not found | CmdClaw",
    };
  }

  return {
    title: `${template.title} | CmdClaw`,
    description: template.description,
  };
}

export default async function TemplatePage({ params }: PageProps) {
  const { templateId } = await params;
  const template = await getTemplateCatalogEntryById(templateId);

  if (!template) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <Link
        href="/templates"
        className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1.5 text-xs transition-colors"
      >
        <ArrowLeft className="size-3" />
        Back to Templates
      </Link>

      <TemplateDetailContent template={template} />
    </div>
  );
}
