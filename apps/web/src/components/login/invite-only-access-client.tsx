"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RequestState = "idle" | "submitting" | "sent" | "already-approved" | "error";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function InviteOnlyAccessClient({
  initialEmail,
  initialSource,
}: {
  initialEmail?: string;
  initialSource?: string;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [status, setStatus] = useState<RequestState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => normalizeEmail(email).length > 0 && status !== "submitting",
    [email, status],
  );

  const handleRequestAccess = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setStatus("submitting");
      setMessage(null);

      const normalizedEmail = normalizeEmail(email);

      try {
        const response = await fetch("/api/invite-only/request-access", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: normalizedEmail,
            source: initialSource ?? "invite-only-page",
          }),
        });

        const result = (await response.json()) as
          | { ok: true; alreadyApproved: boolean }
          | { error?: string };

        if (!response.ok) {
          setStatus("error");
          setMessage(
            ("error" in result ? result.error : undefined) ??
              "We couldn't send your request. Try again.",
          );
          return;
        }

        if ("alreadyApproved" in result && result.alreadyApproved) {
          setStatus("already-approved");
          setMessage("This email is already approved. Head back to login and continue.");
          return;
        }

        setStatus("sent");
        setMessage("Access request sent. We notified the team on Slack and will review it.");
      } catch {
        setStatus("error");
        setMessage("We couldn't send your request. Try again.");
      }
    },
    [email, initialSource],
  );

  const handleEmailChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5efe6] text-[#1f1a17]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(232,119,34,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.16),_transparent_34%)]" />
      <div className="absolute inset-0 [background-image:linear-gradient(rgba(31,26,23,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(31,26,23,0.06)_1px,transparent_1px)] [background-size:32px_32px] opacity-40" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-12">
        <div className="grid w-full gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[2rem] border border-black/10 bg-white/55 p-8 shadow-[0_30px_80px_rgba(31,26,23,0.08)] backdrop-blur-sm md:p-10">
            <div className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[11px] font-medium tracking-[0.24em] uppercase">
              CmdClaw Access
            </div>

            <div className="mt-8 max-w-2xl space-y-5">
              <p className="font-mono text-xs tracking-[0.3em] text-[#8a5a33] uppercase">
                Invite-only release
              </p>
              <h1 className="max-w-xl text-4xl leading-none font-semibold tracking-[-0.04em] text-balance md:text-6xl">
                Not everyone gets in immediately.
              </h1>
              <p className="max-w-xl text-base leading-7 text-[#5f554d] md:text-lg">
                This build is currently gated. If your email is not approved yet, request access
                here and the team will get a Slack notification with your details.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                ["01", "Request access", "Send the email you want approved."],
                ["02", "Team review", "We review requests directly from Slack."],
                ["03", "Get approved", "Once approved, the same email can log in."],
              ].map(([step, title, body]) => (
                <div
                  key={step}
                  className="rounded-[1.5rem] border border-black/10 bg-[#fffaf4] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                >
                  <p className="font-mono text-xs tracking-[0.3em] text-[#a76835]">{step}</p>
                  <h2 className="mt-4 text-lg font-semibold">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#645951]">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-black/10 bg-[#1f1a17] p-8 text-[#f8f1e8] shadow-[0_30px_80px_rgba(31,26,23,0.18)] md:p-10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs tracking-[0.28em] text-[#c8a484] uppercase">Access desk</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Request approval</h2>
              </div>
              <div className="rounded-full border border-white/10 px-3 py-1 font-mono text-xs text-[#d8c0a8]">
                human review
              </div>
            </div>

            <form onSubmit={handleRequestAccess} className="mt-8 space-y-5">
              <div className="space-y-2">
                <label htmlFor="invite-email" className="text-sm font-medium text-[#f8f1e8]">
                  Work email
                </label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="you@company.com"
                  className="h-12 rounded-2xl border-white/10 bg-white/5 text-base text-white placeholder:text-[#9d8f82]"
                  autoComplete="email"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={!canSubmit}
                className="h-12 w-full rounded-2xl bg-[#f08a31] text-sm font-semibold text-[#1f1a17] hover:bg-[#ff9a45]"
              >
                {status === "submitting" ? "Sending request..." : "Request access"}
              </Button>
            </form>

            <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-sm leading-6 text-[#d9cec4]">
              {message ??
                "Use the email you want approved. If it is already on the approved list, you can go straight back to login."}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                variant="outline"
                className="rounded-full border-white/10 bg-transparent text-white hover:bg-white/10"
              >
                <Link href="/login">Back to login</Link>
              </Button>
              {status === "already-approved" ? (
                <Button asChild className="rounded-full bg-white text-[#1f1a17] hover:bg-[#f4eadf]">
                  <Link href="/login">Try login again</Link>
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
