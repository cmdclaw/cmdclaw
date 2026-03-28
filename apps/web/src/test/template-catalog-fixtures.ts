import type { TemplateCatalog, TemplateCatalogTemplate } from "@cmdclaw/db/template-catalog";

export const callFollowUpTemplate: TemplateCatalogTemplate = {
  id: "call-follow-up",
  title: "Send polished follow-ups right after every call",
  description:
    "As soon as a transcript arrives, this coworker builds a short recap, drafts the email, and creates the matching CRM follow-up task.",
  triggerType: "webhook",
  industry: "Sales",
  useCase: "Follow-ups",
  integrations: ["google_gmail", "hubspot"],
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
      integrations: ["google_gmail"],
    },
    {
      title: "Find the matching CRM contact",
      body: "Searches HubSpot by phone and enriches the lead record before writing the follow-up.",
      integrations: ["hubspot"],
    },
    {
      title: "Draft the follow-up in one shot",
      body: "Writes concise notes and creates both a Gmail draft and CRM task.",
      integrations: ["google_gmail", "hubspot"],
    },
  ],
  mermaid: `flowchart TD
    A["Transcript ready"] --> B["Fetch transcript + call metadata"]
    B --> C["Lookup contact in HubSpot"]
    C --> D["Generate follow-up summary"]
    D --> E["Create Gmail draft"]
    D --> F["Create HubSpot task"]`,
  connectedApps: [
    { name: "Aircall", tools: 2, fallbackLabel: "A" },
    { name: "HubSpot", tools: 4, integration: "hubspot" },
    { name: "Gmail", tools: 1, integration: "google_gmail" },
  ],
  featured: true,
};

export const templateCatalogFixture: TemplateCatalog = {
  version: 1,
  exportedAt: "2026-03-28T06:30:00.000Z",
  templates: [callFollowUpTemplate],
};
