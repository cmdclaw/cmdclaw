import Image from "next/image";
import Link from "next/link";
import type { IntegrationType } from "@/lib/integration-icons";
import { INTEGRATION_LOGOS } from "@/lib/integration-icons";

type TemplateCard = {
  id: string;
  title: string;
  description: string;
  integrations: IntegrationType[];
};

type TemplateCategory = {
  name: string;
  color: string;
  templates: TemplateCard[];
};

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    name: "Sales",
    color: "bg-orange-400",
    templates: [
      {
        id: "call-follow-up",
        title: "Send polished follow-ups right after every call",
        description:
          "As soon as an Aircall transcript is ready, this workflow drafts a personalized follow-up email and creates the matching…",
        integrations: ["gmail", "hubspot"],
      },
      {
        id: "company-list-finance-leads",
        title: "Turn your company list into finance leads ready to call",
        description:
          "Process one row at a time from Google Sheets, find the best finance decision-maker, enrich contact data, and push…",
        integrations: ["google_sheets", "linkedin", "hubspot"],
      },
      {
        id: "calendly-qualify",
        title: "Qualify every new Calendly booking before the meeting",
        description:
          "When a new meeting is booked, this workflow researches the person and company, sends a concise briefing,…",
        integrations: ["google_calendar", "linkedin", "hubspot", "slack"],
      },
      {
        id: "deal-decision-makers",
        title: "Map every decision-maker in your top deals automatically",
        description:
          "Every Monday morning, this workflow scans emails, Slack, call notes, and CRM data across your key deals, identifies wh…",
        integrations: ["gmail", "slack", "hubspot", "linkedin", "salesforce"],
      },
      {
        id: "meeting-prep",
        title: "Know who you meet in your next sales call",
        description:
          "Walk into every call already knowing who they are and what they care about. Let your agent do the homework you never…",
        integrations: ["google_calendar", "linkedin", "slack"],
      },
      {
        id: "call-transcript-crm",
        title: "Turn every call transcript into CRM-ready deal intelligence",
        description:
          "This workflow polls CloudTalk, extracts structured commercial insight from each transcript, logs clean records in HubSpo…",
        integrations: ["salesforce", "hubspot", "slack"],
      },
      {
        id: "closed-lost-lessons",
        title: "Capture closed-lost lessons before they get buried",
        description:
          "When a HubSpot deal moves to closed-lost, this workflow reviews deal activity, writes a reusable company-level loss…",
        integrations: ["hubspot", "slack"],
      },
      {
        id: "gmail-to-hubspot-contacts",
        title: "Turn labeled Gmail threads into clean HubSpot contacts",
        description:
          "Apply one Gmail label and this workflow extracts contact details from the latest message, upserts people in HubSpot, an…",
        integrations: ["gmail", "hubspot"],
      },
      {
        id: "daily-call-list",
        title: "Build a daily call list from your company sheet with verified phone numbers",
        description:
          "Every weekday, reads unprocessed companies from Google Sheets, finds decision-makers in Apollo,…",
        integrations: ["google_sheets", "linkedin", "hubspot"],
      },
    ],
  },
];

function IntegrationLogos({ integrations }: { integrations: IntegrationType[] }) {
  return (
    <div className="flex items-center gap-1">
      {integrations.map((key) => {
        const logo = INTEGRATION_LOGOS[key];
        if (!logo) return null;
        return (
          <Image
            key={key}
            src={logo}
            alt={key}
            width={20}
            height={20}
            className="size-5 shrink-0"
          />
        );
      })}
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">Templates</h1>
        <p className="text-muted-foreground mt-1 text-sm">Pre-built workflows ready to deploy</p>
      </div>

      <div className="space-y-10">
        {TEMPLATE_CATEGORIES.map((category) => (
          <section key={category.name}>
            <div className="mb-4 flex items-center gap-2">
              <span className={`size-2 rounded-full ${category.color}`} />
              <h2 className="text-muted-foreground text-sm font-medium">{category.name}</h2>
            </div>

            <div className="border-border/40 bg-card/30 rounded-2xl border p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {category.templates.map((template) => (
                  <Link
                    key={template.id}
                    href={`/template/${template.id}`}
                    className="border-border/40 bg-card hover:border-border hover:bg-muted/30 group flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-all duration-150"
                  >
                    <p className="text-sm leading-tight font-medium">{template.title}</p>
                    <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                      {template.description}
                    </p>
                    <div className="mt-auto pt-1">
                      <IntegrationLogos integrations={template.integrations} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
