"use client";

import type React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { sanitizeReturnPath } from "@/server/control-plane/return-path";

type ResetStatus = "idle" | "submitting" | "success" | "error";

function PasswordResetCard({
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

function getErrorMessage(error: string | null): string {
  switch (error) {
    case "INVALID_TOKEN":
      return "This password link is invalid or has already been used.";
    case "EXPIRED_TOKEN":
      return "This password link expired. Request a new one from the login page.";
    default:
      return "We couldn't update your password. Request a new link and try again.";
  }
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const searchError = searchParams.get("error");
  const callbackUrl = useMemo(
    () => sanitizeReturnPath(searchParams.get("callbackUrl"), "/chat"),
    [searchParams],
  );

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<ResetStatus>("idle");
  const [error, setError] = useState<string | null>(
    searchError ? getErrorMessage(searchError) : null,
  );

  const isExpiredToken = searchError === "EXPIRED_TOKEN";
  const isInvalidToken = !token || searchError === "INVALID_TOKEN";
  const isBlockedTokenState = isInvalidToken || isExpiredToken;

  const submitReset = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!token) {
        setStatus("error");
        setError(getErrorMessage("INVALID_TOKEN"));
        return;
      }

      if (password !== confirmPassword) {
        setStatus("error");
        setError("Passwords do not match.");
        return;
      }

      setStatus("submitting");
      setError(null);

      const { error: resetError } = await authClient.resetPassword({
        token,
        newPassword: password,
      });

      if (resetError) {
        setStatus("error");
        setError(getErrorMessage(resetError.message ?? null));
        return;
      }

      setStatus("success");
      router.push(callbackUrl);
    },
    [callbackUrl, confirmPassword, password, router, token],
  );

  const handlePasswordChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
  }, []);

  const handleConfirmPasswordChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(event.target.value);
  }, []);

  const handleBackToLogin = useCallback(() => {
    router.push("/login");
  }, [router]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4 py-12">
      <PasswordResetCard
        title={
          isExpiredToken
            ? "Expired password link"
            : isInvalidToken
              ? "Invalid password link"
              : "Set your password"
        }
        description={
          isExpiredToken
            ? "This password link expired. Request a new one from the login page."
            : isInvalidToken
              ? "Request a new password email from the login page."
              : "Choose a password for your invite-only CmdClaw account."
        }
      >
        {error ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm">
            {error}
          </div>
        ) : null}

        {!isBlockedTokenState ? (
          <form onSubmit={submitReset} className="space-y-3">
            <label className="text-muted-foreground text-sm font-medium" htmlFor="new-password">
              New password
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="Enter a new password"
              value={password}
              onChange={handlePasswordChange}
              required
              minLength={8}
            />

            <label className="text-muted-foreground text-sm font-medium" htmlFor="confirm-password">
              Confirm password
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              required
              minLength={8}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={
                !password || !confirmPassword || status === "submitting" || status === "success"
              }
            >
              {status === "submitting"
                ? "Updating password..."
                : status === "success"
                  ? "Password updated"
                  : "Set password"}
            </Button>
          </form>
        ) : (
          <Button type="button" className="w-full" onClick={handleBackToLogin}>
            Back to login
          </Button>
        )}
      </PasswordResetCard>
    </div>
  );
}
