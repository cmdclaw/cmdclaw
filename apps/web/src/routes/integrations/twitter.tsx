import { createFileRoute } from "@tanstack/react-router";
import { useGT } from "gt-react";
import { AdminComingSoonPage } from "@/components/integrations/admin-coming-soon-page";

export const Route = createFileRoute("/integrations/twitter")({
  head: () => ({ meta: [{ title: "X (Twitter) - Bap" }] }),
  component: TwitterIntegrationPage,
});

function TwitterIntegrationPage() {
  const t = useGT();

  return (
    <AdminComingSoonPage
      title={t("X (Twitter)")}
      description="X (Twitter) integration is in progress and will be available soon."
    />
  );
}
