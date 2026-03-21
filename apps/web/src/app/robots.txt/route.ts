import { env } from "@/env";

export async function GET() {
  const isSelfHostedEdition = env.CMDCLAW_EDITION === "selfhost";
  const robotsTxt = isSelfHostedEdition
    ? `User-agent: *
Disallow: /
`
    : `User-agent: *
Allow: /
`;

  return new Response(robotsTxt, {
    headers: {
      "Content-Type": "text/plain",
    },
  });
}
