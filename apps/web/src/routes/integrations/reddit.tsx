import { createFileRoute } from "@tanstack/react-router";
import { useGT } from "gt-react";
import { AdminComingSoonPage } from "@/components/integrations/admin-coming-soon-page";

export const Route = createFileRoute("/integrations/reddit")({
  head: () => ({ meta: [{ title: "Reddit - CmdClaw" }] }),
  component: RedditIntegrationPage,
});

function RedditIntegrationPage() {
  const t = useGT();

  return (
    <AdminComingSoonPage
      title={t("Reddit")}
      description="Reddit integration is in progress and will be available soon."
    />
  );
}
