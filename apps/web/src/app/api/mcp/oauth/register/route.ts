import { NextRequest, NextResponse } from "next/server";
import { registerHostedMcpClient } from "@/server/hosted-mcp-oauth";
import { hostedMcpOauthOptionsResponse, withHostedMcpOauthCors } from "../_lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function OPTIONS(request: NextRequest) {
  return hostedMcpOauthOptionsResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      redirect_uris?: string[];
      token_endpoint_auth_method?: string;
      grant_types?: string[];
      response_types?: string[];
      client_name?: string;
      client_uri?: string;
      logo_uri?: string;
      contacts?: string[];
      policy_uri?: string;
      tos_uri?: string;
      scope?: string;
    };

    const registered = await registerHostedMcpClient(body);
    return withHostedMcpOauthCors(
      request,
      NextResponse.json(registered, {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      }),
    );
  } catch (error) {
    return withHostedMcpOauthCors(
      request,
      NextResponse.json(
        {
          error: "invalid_client_metadata",
          error_description: error instanceof Error ? error.message : "Invalid client metadata",
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      ),
    );
  }
}
