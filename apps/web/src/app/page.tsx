import type { Metadata } from "next";
import { headers } from "next/headers";
import { CoworkerLanding } from "@/components/landing/coworker-landing";
import { env } from "@/env";
import { auth } from "@/lib/auth";
import { listFeaturedTemplateCatalogEntries } from "@/server/services/template-catalog";

const isSelfHostedEdition = env.CMDCLAW_EDITION === "selfhost";
const siteUrl = env.APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? "https://cmdclaw.ai";

const title = isSelfHostedEdition ? "CmdClaw Self-hosted" : "CmdClaw";
const description = isSelfHostedEdition
  ? "Your self-hosted CmdClaw deployment"
  : "Turn plain-English tasks into AI coworkers that run across your tools. Handle one-off work instantly or automate recurring workflows for your team.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: "CmdClaw",
    type: "website",
    images: [
      {
        url: `${siteUrl.replace(/\/$/, "")}/logo.png`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [`${siteUrl.replace(/\/$/, "")}/logo.png`],
  },
};

export default async function Home() {
  const requestHeaders = await headers();
  const sessionData = await auth.api.getSession({
    headers: requestHeaders,
  });
  const featuredTemplates = await listFeaturedTemplateCatalogEntries({ limit: 8 });
  const initialHasSession = Boolean(sessionData?.session && sessionData?.user);
  const initialFirstName = sessionData?.user?.name?.trim().split(/\s+/, 1).find(Boolean) ?? null;

  return (
    <CoworkerLanding
      initialHasSession={initialHasSession}
      initialFirstName={initialFirstName}
      featuredTemplates={featuredTemplates}
    />
  );
}
