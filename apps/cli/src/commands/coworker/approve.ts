import type { LocalContext } from "../../context";
import { getCoworkerRunner } from "./shared";

type ApproveFlags = {
  server?: string;
};

export default async function (
  this: LocalContext,
  flags: ApproveFlags,
  runId: string,
  toolUseId: string,
  decision: "approve" | "deny",
): Promise<void> {
  if (decision !== "approve" && decision !== "deny") {
    throw new Error("Decision must be 'approve' or 'deny'");
  }

  const { runner, client } = getCoworkerRunner({ server: flags.server });
  const run = await runner.logs(runId);
  if (!run.generationId) {
    throw new Error(`Run ${runId} has no active generation for approval.`);
  }

  const result = await client.generation.submitApproval({
    generationId: run.generationId,
    toolUseId,
    decision,
  });

  if (!result.success) {
    throw new Error("Approval was not applied. Request may be stale or already resolved.");
  }

  this.process.stdout.write(`Submitted ${decision} for ${toolUseId} on run ${runId}.\n`);
}
