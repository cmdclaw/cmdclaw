import { TemplateDeployPage } from "@/components/template-deploy-page";

export default async function CoworkerTemplateDeployPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;

  return <TemplateDeployPage templateId={templateId} />;
}
