import type React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { INVITE_ONLY_LOGIN_ERROR } from "@/lib/admin-emails";
import { buildSignInMagicLinkPath } from "@/lib/magic-link-request";
import { resolveMagicLinkPageState } from "@/server/lib/magic-link-request-state";

type SignInTokenPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    error?: string;
    resent?: string;
  }>;
};

function SignInCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card mx-auto flex w-full max-w-lg flex-col gap-6 rounded-2xl border p-6 shadow-sm">
      <div className="space-y-1 text-center">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
          CmdClaw
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </div>
  );
}

export default async function SignInTokenPage({ params, searchParams }: SignInTokenPageProps) {
  const { token } = await params;
  const query = await searchParams;
  const state = await resolveMagicLinkPageState(token);
  const signInPath = buildSignInMagicLinkPath(token);
  const confirmPath = `${signInPath}/confirm`;
  const resendPath = `${signInPath}/resend`;
  const hasResentBanner = query.resent === "1" && state.status !== "invalid";
  const hasGenericError = Boolean(query.error);
  const errorMessage =
    query.error === INVITE_ONLY_LOGIN_ERROR
      ? "This app is invite-only. That email address is not approved yet."
      : "We couldn't complete that sign-in. Request a new link and try again.";

  const title =
    state.status === "pending"
      ? "Confirm sign-in"
      : state.status === "expired"
        ? "Link expired"
        : state.status === "consumed"
          ? "Link already used"
          : "Invalid link";

  const description =
    state.status === "pending"
      ? `Continue to sign in as ${state.email}.`
      : state.status === "expired"
        ? `This sign-in link for ${state.email} has expired.`
        : state.status === "consumed"
          ? `This sign-in link for ${state.email} has already been used.`
          : "This sign-in link is invalid or no longer available.";

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-12">
      <SignInCard title={title} description={description}>
        {hasResentBanner ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-100">
            We sent a new sign-in link to {state.email}.
          </div>
        ) : null}

        {hasGenericError ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm">
            {errorMessage}
          </div>
        ) : null}

        {state.status === "pending" ? (
          <form action={confirmPath} method="post" className="space-y-3">
            <div className="rounded-xl border p-4 text-sm">
              <div className="text-muted-foreground">Email</div>
              <div className="mt-1 font-medium">{state.email}</div>
            </div>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        ) : null}

        {(state.status === "expired" || state.status === "consumed") && state.email ? (
          <form action={resendPath} method="post" className="space-y-3">
            <Button type="submit" variant="outline" className="w-full">
              Resend link
            </Button>
          </form>
        ) : null}

        {state.status === "invalid" ? (
          <Button asChild className="w-full">
            <Link href="/login">Back to login</Link>
          </Button>
        ) : null}
      </SignInCard>
    </div>
  );
}
