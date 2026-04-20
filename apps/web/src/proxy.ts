import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildWorktreeAutoLoginPath,
  isWorktreeAutoLoginConfigured,
} from "@/lib/worktree-auto-login";

const protectedRoutes = ["/chat", "/settings", "/onboarding", "/admin", "/instance"];
const publicRoutes = [
  "/login",
  "/api/auth",
  "/api/dev/worktree-auth",
  "/legal",
  "/support",
  "/shared",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-cmdclaw-pathname", pathname);
  requestHeaders.set("x-cmdclaw-return-path", `${pathname}${request.nextUrl.search}`);
  const nextResponse = () =>
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

  // Allow public routes and static assets
  if (
    publicRoutes.some((route) => pathname.startsWith(route)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/rpc") ||
    pathname.includes(".")
  ) {
    return nextResponse();
  }

  // Check if accessing a protected route
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtectedRoute) {
    // Check for better-auth session cookie (with __Secure- prefix in production HTTPS)
    const sessionCookie =
      request.cookies.get("__Secure-better-auth.session_token") ||
      request.cookies.get("better-auth.session_token");

    if (!sessionCookie?.value) {
      if (isWorktreeAutoLoginConfigured()) {
        return NextResponse.redirect(
          new URL(
            buildWorktreeAutoLoginPath(`${pathname}${request.nextUrl.search}`, pathname),
            request.url,
          ),
        );
      }

      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  return nextResponse();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
