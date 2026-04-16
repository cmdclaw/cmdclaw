import { NextRequest, NextResponse } from "next/server";
import {
  hostedMcpOauthOptionsResponse,
  withHostedMcpOauthCors,
} from "@/app/api/mcp/oauth/_lib/cors";
import { buildHostedMcpAuthorizationServerMetadata } from "@/server/hosted-mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function OPTIONS(request: NextRequest) {
  return hostedMcpOauthOptionsResponse(request);
}

export async function GET(request: NextRequest) {
  return withHostedMcpOauthCors(
    request,
    NextResponse.json(buildHostedMcpAuthorizationServerMetadata(request), {
      headers: {
        "Cache-Control": "no-store",
      },
    }),
  );
}
