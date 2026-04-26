import { NextResponse } from "next/server";
import { z } from "zod";
import { INVITE_ONLY_LOGIN_ERROR } from "@/lib/admin-emails";
import { auth } from "@/lib/auth";
import { buildRequestAwareUrl } from "@/lib/request-aware-url";
import { sanitizeReturnPath } from "@/server/control-plane/return-path";
import {
  isApprovedLoginEmail,
  normalizeApprovedLoginEmail,
} from "@/server/lib/approved-login-emails";
import { resolveOrCreateAuthUserByEmail } from "@/server/lib/credential-accounts";

const requestSchema = z.object({
  email: z.string().email(),
  callbackUrl: z.string().optional(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const normalizedEmail = normalizeApprovedLoginEmail(parsedBody.data.email);
  const callbackUrl = sanitizeReturnPath(parsedBody.data.callbackUrl, "/chat");

  if (!(await isApprovedLoginEmail(normalizedEmail))) {
    return NextResponse.json({ ok: false, code: INVITE_ONLY_LOGIN_ERROR }, { status: 403 });
  }

  await resolveOrCreateAuthUserByEmail({ email: normalizedEmail });

  const redirectTo = buildRequestAwareUrl("/reset-password", request);
  redirectTo.searchParams.set("callbackUrl", callbackUrl);

  await auth.api.requestPasswordReset({
    body: {
      email: normalizedEmail,
      redirectTo: redirectTo.toString(),
    },
    headers: request.headers,
  });

  return NextResponse.json({ ok: true });
}
