import { env } from "@/env";

function getSitemapUrl() {
  const appUrl = env.APP_URL ?? env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    return null;
  }

  try {
    return new URL("/sitemap.xml", appUrl).toString();
  } catch {
    return null;
  }
}

export async function GET() {
  const isSelfHostedEdition = env.CMDCLAW_EDITION === "selfhost";
  const sitemapUrl = getSitemapUrl();
  const lines = ["User-Agent: *", isSelfHostedEdition ? "Disallow: /" : "Disallow:"];

  if (sitemapUrl) {
    lines.push(`Sitemap: ${sitemapUrl}`);
  }

  const robotsTxt = `${lines.join("\n")}\n`;

  return new Response(robotsTxt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
