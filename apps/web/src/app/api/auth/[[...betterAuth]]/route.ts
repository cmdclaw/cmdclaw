import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { INVITE_ONLY_LOGIN_ERROR } from "@/lib/admin-emails";
import { auth } from "@/lib/auth";
import { buildRequestAwareUrl } from "@/lib/request-aware-url";
import { getTrustedOrigins } from "@/lib/trusted-origins";

const trustedOrigins = new Set(getTrustedOrigins());

const DEFAULT_ALLOWED_ORIGIN =
  env.APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

function getCorsHeaders(origin: string | null) {
  const isAllowed = origin && trustedOrigins.has(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : DEFAULT_ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

const {
  GET: getHandler,
  POST: postHandler,
  PUT: putHandler,
  PATCH: patchHandler,
  DELETE: deleteHandler,
} = toNextJsHandler(auth);

async function isInviteOnlyErrorResponse(response: Response): Promise<boolean> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return false;
  }

  try {
    const body = (await response.clone().json()) as {
      code?: string;
      message?: string;
    };
    return body.code === INVITE_ONLY_LOGIN_ERROR || body.message === INVITE_ONLY_LOGIN_ERROR;
  } catch {
    return false;
  }
}

async function redirectInviteOnlyAuthError(
  request: NextRequest,
  response: Response,
): Promise<Response | null> {
  const callbackPrefix = "/api/auth/callback/";
  if (!request.nextUrl.pathname.startsWith(callbackPrefix)) {
    return null;
  }

  if (!(await isInviteOnlyErrorResponse(response))) {
    return null;
  }

  const provider = request.nextUrl.pathname.slice(callbackPrefix.length);
  const inviteOnlyUrl = buildRequestAwareUrl("/invite-only", request);
  inviteOnlyUrl.searchParams.set("source", provider ? `social-${provider}` : "social");
  return NextResponse.redirect(inviteOnlyUrl);
}

async function withCors(request: NextRequest, handler: (req: NextRequest) => Promise<Response>) {
  const origin = request.headers.get("origin");
  const handledResponse = await handler(request);
  const response = (await redirectInviteOnlyAuthError(request, handledResponse)) ?? handledResponse;
  const corsHeaders = getCorsHeaders(origin);

  const newResponse = new NextResponse(response.body, response);

  // Preserve Set-Cookie headers from the original response.
  // new NextResponse(body, init) can drop multi-value Set-Cookie headers,
  // so we re-apply them explicitly.
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) {
    // Clear any partially-copied cookies first
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- Headers.delete, not a Drizzle query
    newResponse.headers.delete("set-cookie");
    for (const cookie of setCookies) {
      newResponse.headers.append("set-cookie", cookie);
    }
  }

  Object.entries(corsHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });

  return newResponse;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function GET(request: NextRequest) {
  return withCors(request, getHandler);
}

export async function POST(request: NextRequest) {
  return withCors(request, postHandler);
}

export async function PUT(request: NextRequest) {
  return withCors(request, putHandler);
}

export async function PATCH(request: NextRequest) {
  return withCors(request, patchHandler);
}

export async function DELETE(request: NextRequest) {
  return withCors(request, deleteHandler);
}
