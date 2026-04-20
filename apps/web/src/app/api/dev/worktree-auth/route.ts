import { NextResponse } from "next/server";
import {
  canUseWorktreeAutoLoginForRequest,
  WORKTREE_AUTO_LOGIN_UNAVAILABLE_ERROR,
} from "@/lib/worktree-auto-login";
import { sanitizeReturnPath } from "@/server/control-plane/return-path";
import { loadWorktreeSessionCookie } from "@/server/worktree-auto-login-storage";

export const runtime = "nodejs";

function getSessionCookieName(requestUrl: string): string {
  return new URL(requestUrl).protocol === "https:"
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
}

function redirectToLogin(request: Request, callbackUrl: string): Response {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  loginUrl.searchParams.set("error", WORKTREE_AUTO_LOGIN_UNAVAILABLE_ERROR);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const callbackUrl = sanitizeReturnPath(requestUrl.searchParams.get("callbackUrl"), "/chat");

  if (!canUseWorktreeAutoLoginForRequest(request)) {
    return redirectToLogin(request, callbackUrl);
  }

  const worktreeSessionCookie = loadWorktreeSessionCookie();
  if (!worktreeSessionCookie) {
    return redirectToLogin(request, callbackUrl);
  }

  const response = NextResponse.redirect(new URL(callbackUrl, request.url));
  const cookieName = getSessionCookieName(request.url);
  response.cookies.set(cookieName, worktreeSessionCookie.value, {
    httpOnly: worktreeSessionCookie.httpOnly,
    sameSite: worktreeSessionCookie.sameSite,
    secure: cookieName.startsWith("__Secure-"),
    expires: worktreeSessionCookie.expires,
    path: "/",
  });

  const otherCookieName =
    cookieName === "better-auth.session_token"
      ? "__Secure-better-auth.session_token"
      : "better-auth.session_token";
  response.cookies.delete(otherCookieName);

  return response;
}
