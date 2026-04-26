import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isApprovedLoginEmail,
  normalizeApprovedLoginEmail,
} from "@/server/lib/approved-login-emails";

const requestSchema = z.object({
  email: z.string().email(),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ approved: false }, { status: 400 });
  }

  const normalizedEmail = normalizeApprovedLoginEmail(parsedBody.data.email);
  const approved = await isApprovedLoginEmail(normalizedEmail);

  return NextResponse.json({ approved });
}
