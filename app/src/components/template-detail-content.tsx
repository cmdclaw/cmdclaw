"use client";

import { ArrowRight, Play, Link2, Share2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { Button } from "@/components/ui/button";
import { INTEGRATION_LOGOS } from "@/lib/integration-icons";
import { type TemplateContent, base64Url } from "@/lib/template-data";

export function TemplateDetailContent({ template }: { template: TemplateContent }) {
  const mermaidImage = `https://mermaid.ink/img/${base64Url(template.mermaid)}?bgColor=f8f8f8`;

  const integrationIcons = template.connectedApps
    .filter((app) => app.integration)
    .map((app) => app.integration!);
  const extraCount = template.connectedApps.filter((app) => !app.integration).length;

  return (
    <div className="mx-auto max-w-3xl pb-8">
      {/* ── Hero section ── */}
      <div className="grid grid-cols-1 gap-12 pb-16 md:grid-cols-[1fr_1.3fr] md:gap-16">
        {/* Intro */}
        <div className="flex flex-col">
          {/* Integration icons row */}
          <div className="mb-5 flex items-center gap-2">
            {integrationIcons.map((key) => (
              <span
                key={key}
                className="bg-muted inline-flex size-9 items-center justify-center rounded-lg"
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
              <span className="text-muted-foreground bg-muted inline-flex size-9 items-center justify-center rounded-lg text-xs font-medium">
                +{extraCount}
              </span>
            )}
          </div>

          <h1 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl md:leading-snug">
            {template.title}
          </h1>
          <p className="text-muted-foreground mt-4 max-w-[38ch] text-sm leading-relaxed">
            {template.description}
          </p>

          <div className="mt-8">
            <Button asChild className="gap-1.5 rounded-lg px-5">
              <Link href={`/workflows?template=${template.id}`}>
                <Play className="size-3.5 fill-current" />
                {template.heroCta}
              </Link>
            </Button>
          </div>

          {/* Metadata */}
          <div className="mt-12 space-y-6">
            <div>
              <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-widest uppercase">
                Category
              </p>
              <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
                {template.category}
              </span>
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-widest uppercase">
                Steps
              </p>
              <p className="text-sm">
                {template.summaryBlocks.length} steps · {template.connectedApps.length} apps
              </p>
            </div>

            <div>
              <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-widest uppercase">
                Share
              </p>
              <div className="flex items-center gap-3">
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

        {/* Workflow summary */}
        <div>
          <section>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">What this workflow does</h2>
                <p className="text-muted-foreground mt-1 text-xs">Step-by-step breakdown</p>
              </div>
              <div className="border-border/50 bg-muted/50 inline-flex rounded-lg border p-0.5 text-xs">
                <span className="bg-card text-foreground rounded-md px-2.5 py-1 font-medium shadow-sm">
                  Summary
                </span>
                <span className="text-muted-foreground px-2.5 py-1">Preview</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              {template.summaryBlocks.map((block) => (
                <div
                  key={block.title}
                  className="border-border/40 bg-card flex flex-col gap-3.5 rounded-xl border p-5 shadow-sm"
                >
                  <div className="flex items-center gap-1.5">
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
                    <p className="text-sm leading-snug font-medium">{block.title}</p>
                    <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                      {block.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* ── Below hero: single-column content ── */}
      <div className="space-y-14">
        {/* ── Agent instructions ── */}
        <section>
          <div className="mb-5">
            <h2 className="text-sm font-semibold">Agent Instructions</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Trigger details and execution steps
            </p>
          </div>
          <div className="border-border/40 bg-card space-y-6 rounded-xl border p-6 shadow-sm">
            <div>
              <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                Trigger
              </p>
              <p className="mt-3 text-base font-semibold">{template.triggerTitle}</p>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                {template.triggerDescription}
              </p>
            </div>
            <div className="border-border/30 border-t pt-6">
              <p className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                Instructions
              </p>
              <ol className="mt-3 space-y-3 pl-5 text-sm leading-relaxed">
                {template.agentInstructions.map((instruction) => (
                  <li key={instruction} className="list-decimal pl-1">
                    {instruction}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ── Workflow diagram ── */}
        <section>
          <div className="mb-5">
            <h2 className="text-sm font-semibold">Workflow Diagram</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Visual overview of the automation flow
            </p>
          </div>
          <MermaidDiagram imageUrl={mermaidImage} source={template.mermaid} />
        </section>

        {/* ── Connected Apps ── */}
        <section>
          <div className="mb-5">
            <h2 className="text-sm font-semibold">Connected Apps</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {template.connectedApps.length} app{template.connectedApps.length === 1 ? "" : "s"}{" "}
              used by this workflow
            </p>
          </div>
          <div className="border-border/40 bg-card rounded-xl border shadow-sm">
            {template.connectedApps.map((app, i) => (
              <div
                key={app.name}
                className={`flex items-center justify-between px-5 py-4 ${
                  i < template.connectedApps.length - 1 ? "border-border/40 border-b" : ""
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span className="bg-muted inline-flex size-9 items-center justify-center rounded-lg">
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
                  {app.tools} tool{app.tools === 1 ? "" : "s"}
                  <ArrowRight className="size-3" />
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Deploy CTA ── */}
        <section className="flex justify-center pt-2 pb-4">
          <Button asChild className="gap-1.5 rounded-lg px-8">
            <Link href={`/workflows?template=${template.id}`}>
              Deploy the agent
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
