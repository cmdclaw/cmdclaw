import { isSelfHostedEdition } from "@cmdclaw/core/server/edition";
import { redirect } from "next/navigation";
import { getInstanceHealthStatus } from "@/server/instance/health";

function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail ? <p className="text-muted-foreground mt-1 text-xs">{detail}</p> : null}
      </div>
      <span
        className={`rounded-full px-2 py-1 text-xs font-medium ${
          ok
            ? "bg-green-500/10 text-green-700 dark:text-green-300"
            : "bg-destructive/10 text-destructive"
        }`}
      >
        {ok ? "Healthy" : "Issue"}
      </span>
    </div>
  );
}

export default async function InstancePage() {
  if (!isSelfHostedEdition()) {
    redirect("/admin");
  }

  const health = await getInstanceHealthStatus();

  return (
    <div className="bg-background min-h-full">
      <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-10 md:px-6 md:pt-10">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Instance</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Deployment health and control-plane status for this self-hosted instance.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              health.ok
                ? "bg-green-500/10 text-green-700 dark:text-green-300"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {health.ok ? "Healthy" : "Attention needed"}
          </span>
        </div>

        <div className="space-y-3">
          <CheckRow
            label="Database"
            ok={health.checks.database.ok}
            detail={health.checks.database.detail}
          />
          <CheckRow label="Redis" ok={health.checks.redis.ok} detail={health.checks.redis.detail} />
          <CheckRow label="S3 storage" ok={health.checks.s3.ok} detail={health.checks.s3.detail} />
          <CheckRow label="E2B" ok={health.checks.e2b.ok} detail={health.checks.e2b.detail} />
          <CheckRow
            label="Cloud control plane"
            ok={health.checks.controlPlane.ok}
            detail={health.checks.controlPlane.detail}
          />
        </div>

        <div className="mt-6 rounded-lg border px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span>
              <span className="text-muted-foreground">Edition:</span> {health.edition}
            </span>
            <span>
              <span className="text-muted-foreground">Checked:</span>{" "}
              {new Date(health.checkedAt).toLocaleString()}
            </span>
            <span>
              <span className="text-muted-foreground">Sandbox backend:</span> E2B
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
