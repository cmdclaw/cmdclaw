import type { IntegrationType } from "@/lib/integration-icons";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConnectedApp = {
  name: string;
  tools: number;
  integration?: IntegrationType;
  fallbackLabel?: string;
};

export type TemplateContent = {
  id: string;
  category: string;
  title: string;
  description: string;
  triggerTitle: string;
  triggerDescription: string;
  agentInstructions: string[];
  heroCta: string;
  summaryBlocks: {
    title: string;
    body: string;
    integrations: IntegrationType[];
  }[];
  mermaid: string;
  connectedApps: ConnectedApp[];
};

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_TEMPLATES: Record<string, TemplateContent> = {
  "call-follow-up": {
    id: "call-follow-up",
    category: "Sales",
    title: "Send polished follow-ups right after every call",
    description:
      "As soon as a transcript arrives, this coworker builds a short recap, drafts the email, and creates the matching CRM follow-up task.",
    triggerTitle: "Call Transcription Ready",
    triggerDescription: "When an Aircall call transcription becomes available.",
    agentInstructions: [
      "Get call details with aircall_get_call using your Aircall connection ID.",
      "Get transcription with aircall_get_transcription using your Aircall connection ID.",
      "Extract the external participant phone number from number.raw_digits.",
      "Search HubSpot contacts by phone with hubspot_search_contacts and request properties: email, firstname, lastname.",
      "If contact payload is incomplete, call hubspot_get_contact to fill missing fields.",
      "Generate a 2-3 sentence call summary and explicit action items for both parties.",
      "If contact email exists, create a Gmail draft with friendly greeting, short summary, bullet action items, and professional closing.",
      "Create a HubSpot task with subject 'Follow up on call with [Contact Name]', include summary + actions, and schedule for tomorrow at 9 AM.",
      "If contact exists, associate task to contact using HUBSPOT_DEFINED association type 204.",
      "If no contact is found, skip Gmail draft and still create the HubSpot task with the phone number in the body.",
    ],
    heroCta: "Deploy this coworker",
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

export function base64Url(input: string) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function getTemplateById(id: string): TemplateContent {
  if (MOCK_TEMPLATES[id]) {
    return MOCK_TEMPLATES[id];
  }
  return {
    ...MOCK_TEMPLATES["call-follow-up"],
    id,
    category: "Template",
    title: `Coworker template: ${id.replace(/[-_]/g, " ")}`,
  };
}
