import { postInviteOnlyAccessRequestSlackNotification } from "@cmdclaw/core/server/services/telemetry-slack";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isApprovedLoginEmail } from "@/server/lib/approved-login-emails";

const requestAccessSchema = z.object({
  email: z.string().email(),
  source: z.string().trim().min(1).max(100).optional(),
});

export async function POST(request: Request) {
  let parsedBody: z.infer<typeof requestAccessSchema>;

  try {
    parsedBody = requestAccessSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (await isApprovedLoginEmail(parsedBody.email)) {
    return NextResponse.json({ ok: true, alreadyApproved: true });
  }

  const notified = await postInviteOnlyAccessRequestSlackNotification({
    email: parsedBody.email.trim().toLowerCase(),
    source: parsedBody.source ?? "invite-only-page",
    occurredAt: new Date(),
    referrer: request.headers.get("referer"),
  });

  if (!notified) {
    return NextResponse.json(
      { error: "Request access notifications are not configured" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, alreadyApproved: false });
}
