import { T } from "gt-react";
import { ArrowLeft } from "lucide-react";
import { UsageDashboard } from "@/components/usage-dashboard";
import { useWorkspaceUsageDashboard } from "@/orpc/hooks/coworkers";
import { AppLink as Link } from "../-lib/app-link";

export default function CoworkerUsagePage() {
  const usageQuery = useWorkspaceUsageDashboard();

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          href="/agents"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          <T>Usage</T>
        </h1>
      </div>
      <UsageDashboard
        data={usageQuery.data}
        isLoading={usageQuery.isLoading && !usageQuery.data}
        error={usageQuery.error}
      />
    </div>
  );
}
