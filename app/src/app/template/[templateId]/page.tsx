import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Play, Link2, Share2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { INTEGRATION_LOGOS, type IntegrationType } from "@/lib/integration-icons";

type ConnectedApp = {
  name: string;
  tools: number;
  integration?: IntegrationType;
  fallbackLabel?: string;
};

type TemplateContent = {
  id: string;
  category: string;
  title: string;
  description: string;
  heroCta: string;
  summaryBlocks: {
    title: string;
    body: string;
    integrations: IntegrationType[];
  }[];
  mermaid: string;
  connectedApps: ConnectedApp[];
};

const MOCK_TEMPLATES: Record<string, TemplateContent> = {
  "call-follow-up": {
    id: "call-follow-up",
    category: "Sales",
    title: "Send polished follow-ups right after every call",
    description:
      "As soon as a transcript arrives, this workflow builds a short recap, drafts the email, and creates the matching CRM follow-up task.",
    heroCta: "Deploy this template",
    summaryBlocks: [
      {
        title: "Capture new call transcript",
        body: "Watches for a completed transcript and pulls metadata for the contact context.",
        integrations: ["gmail"],
      },
      {
        title: "Find the matching CRM contact",
        body: "Searches HubSpot by phone and enriches with owner, stage, and open opportunity fields.",
        integrations: ["hubspot"],
      },
      {
        title: "Draft the follow-up in one shot",
        body: "Writes concise notes + next actions and creates both a Gmail draft and CRM task.",
        integrations: ["gmail", "hubspot"],
      },
    ],
    mermaid: `flowchart TD
    A["Transcript ready"] --> B["Fetch transcript + call metadata"]
    B --> C["Lookup contact in HubSpot"]
    C --> D["Generate follow-up summary"]
    D --> E["Create Gmail draft"]
    D --> F["Create HubSpot task"]
    E --> G["Notify sales rep in Slack"]
    F --> G`,
    connectedApps: [
      { name: "Aircall", tools: 4, fallbackLabel: "A" },
      { name: "HubSpot", tools: 4, integration: "hubspot" },
      { name: "Gmail", tools: 1, integration: "gmail" },
      { name: "Slack", tools: 1, integration: "slack" },
    ],
  },
};

function base64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function fromId(id: string): TemplateContent {
  if (MOCK_TEMPLATES[id]) {
    return MOCK_TEMPLATES[id];
  }
  return {
    ...MOCK_TEMPLATES["call-follow-up"],
    id,
    category: "Template",
    title: `Workflow template: ${id.replace(/[-_]/g, " ")}`,
  };
}

type PageProps = {
  params: Promise<{
    templateId: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { templateId } = await params;
  const template = fromId(templateId);
  return {
    title: `${template.title} | CmdClaw`,
    description: template.description,
  };
}

export default async function TemplatePage({ params }: PageProps) {
  const { templateId } = await params;
  const template = fromId(templateId);
  const mermaidImage = `https://mermaid.ink/img/${base64Url(template.mermaid)}?bgColor=f8f8f8`;

  // Collect unique integration icons from connected apps
  const integrationIcons = template.connectedApps
    .filter((app) => app.integration)
    .map((app) => app.integration!);
  const extraCount = template.connectedApps.filter((app) => !app.integration).length;

  return (
    <div>
      {/* ── Two-column hero ── */}
      <div className="grid grid-cols-1 gap-8 pt-6 pb-10 md:grid-cols-[1fr_1.4fr] md:gap-10">
        {/* Left: info */}
        <div className="flex flex-col">
          <Link
            href="/template"
            className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-xs transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back to Templates
          </Link>

          {/* Integration icons row */}
          <div className="mb-4 flex items-center gap-1.5">
            {integrationIcons.map((key) => (
              <span
                key={key}
                className="bg-muted inline-flex size-8 items-center justify-center rounded-lg"
              >
                <Image
                  src={INTEGRATION_LOGOS[key]}
                  alt={key}
                  width={16}
                  height={16}
                  className="size-4"
                />
              </span>
            ))}
            {extraCount > 0 && (
              <span className="text-muted-foreground bg-muted inline-flex size-8 items-center justify-center rounded-lg text-xs font-medium">
                +{extraCount}
              </span>
            )}
          </div>

          <h1 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
            {template.title}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-[40ch] text-sm leading-relaxed">
            {template.description}
          </p>

          <div className="mt-6">
            <Button asChild className="gap-1.5 rounded-lg px-5">
              <Link href={`/workflows?template=${template.id}`}>
                <Play className="size-3.5 fill-current" />
                {template.heroCta}
              </Link>
            </Button>
          </div>

          {/* Metadata */}
          <div className="mt-10 space-y-5">
            <div>
              <p className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-widest uppercase">
                Category
              </p>
              <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
                {template.category}
              </span>
            </div>

            <div>
              <p className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-widest uppercase">
                Steps
              </p>
              <p className="text-sm">
                {template.summaryBlocks.length} steps · {template.connectedApps.length} apps
              </p>
            </div>

            <div>
              <p className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-widest uppercase">
                Share
              </p>
              <div className="flex items-center gap-2">
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Link2 className="size-4" />
                </button>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Share2 className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: workflow diagram preview */}
        <div className="border-border/40 bg-card overflow-hidden rounded-2xl border shadow-sm">
          <div className="p-5">
            <Image
              src={mermaidImage}
              alt="Mermaid diagram for workflow"
              width={1100}
              height={740}
              className="h-auto w-full rounded-lg object-contain"
              unoptimized
            />
          </div>
          <details className="border-border/40 border-t px-5 py-3">
            <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
              Show Mermaid source
            </summary>
            <pre className="bg-muted mt-3 overflow-x-auto rounded-md p-3 text-xs">
              <code>{template.mermaid}</code>
            </pre>
          </details>
        </div>
      </div>

      {/* ── Below hero: single-column content ── */}
      <div className="space-y-10 pb-6">
        {/* ── What this workflow does ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">What this workflow does</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">Step-by-step breakdown</p>
            </div>
            <div className="border-border/50 bg-muted/50 inline-flex rounded-lg border p-0.5 text-xs">
              <span className="bg-card text-foreground rounded-md px-2.5 py-1 font-medium shadow-sm">
                Summary
              </span>
              <span className="text-muted-foreground px-2.5 py-1">Preview</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {template.summaryBlocks.map((block) => (
              <div
                key={block.title}
                className="border-border/40 bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm"
              >
                <div className="flex items-center gap-1">
                  {block.integrations.map((integration) => (
                    <span
                      key={`${block.title}-${integration}`}
                      className="bg-muted inline-flex size-7 items-center justify-center rounded-lg"
                    >
                      <Image
                        src={INTEGRATION_LOGOS[integration]}
                        alt={integration}
                        width={14}
                        height={14}
                        className="size-3.5"
                      />
                    </span>
                  ))}
                </div>
                <div>
                  <p className="text-sm leading-tight font-medium">{block.title}</p>
                  <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                    {block.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Connected Apps ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Connected Apps</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {template.connectedApps.length} app{template.connectedApps.length === 1 ? "" : "s"}{" "}
              used by this workflow
            </p>
          </div>
          <div className="border-border/40 bg-card rounded-xl border shadow-sm">
            {template.connectedApps.map((app, i) => (
              <div
                key={app.name}
                className={`flex items-center justify-between px-4 py-3 ${
                  i < template.connectedApps.length - 1 ? "border-border/40 border-b" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="bg-muted inline-flex size-8 items-center justify-center rounded-lg">
                    {app.integration ? (
                      <Image
                        src={INTEGRATION_LOGOS[app.integration]}
                        alt={app.name}
                        width={16}
                        height={16}
                        className="size-4"
                      />
                    ) : (
                      <span className="text-foreground text-xs font-semibold">
                        {app.fallbackLabel}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-medium">{app.name}</span>
                </div>
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  {app.tools} tools
                  <ArrowRight className="size-3" />
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Deploy CTA ── */}
        <section className="pb-4">
          <Button asChild size="lg" className="w-full rounded-xl py-6 text-base">
            <Link href={`/workflows?template=${template.id}`}>Deploy the agent</Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
