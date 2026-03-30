export type InboxItemStatus =
  | "running"
  | "awaiting_approval"
  | "awaiting_auth"
  | "paused"
  | "completed"
  | "error"
  | "cancelled";

export type ToolApprovalData = {
  toolUseId: string;
  toolName: string;
  toolInput: unknown;
  integration: string;
  operation: string;
  command: string;
};

export type AuthRequestData = {
  integrations: string[];
  connectedIntegrations: string[];
  reason?: string;
};

export type InboxItem = {
  id: string;
  title: string;
  status: InboxItemStatus;
  agentName: string;
  agentId: string;
  createdAt: Date;
  updatedAt: Date;
  errorMessage?: string;
  toolApproval?: ToolApprovalData;
  authRequest?: AuthRequestData;
};

export type MockAgent = { id: string; name: string };

export const MOCK_AGENTS: MockAgent[] = [
  { id: "agent-1", name: "Email Assistant" },
  { id: "agent-2", name: "Slack Reporter" },
  { id: "agent-3", name: "Data Analyst" },
  { id: "agent-4", name: "PR Reviewer" },
  { id: "agent-5", name: "Support Bot" },
];

const now = Date.now();
const minutes = (n: number) => new Date(now - n * 60_000);
const hours = (n: number) => new Date(now - n * 3_600_000);

export const MOCK_INBOX_ITEMS: InboxItem[] = [
  {
    id: "inbox-1",
    title: "Send weekly team digest to #general",
    status: "awaiting_approval",
    agentName: "Slack Reporter",
    agentId: "agent-2",
    createdAt: minutes(3),
    updatedAt: minutes(1),
    toolApproval: {
      toolUseId: "tool-1",
      toolName: "slack_send",
      toolInput: {
        channel: "#general",
        text: "Hello team! Here's the weekly update on our project progress. We've made significant improvements to the API performance.\n\nKey highlights:\n- Deployment latency reduced by 40%\n- 3 new integrations shipped\n- Customer satisfaction up to 94%\n\nGreat work everyone!",
      },
      integration: "slack",
      operation: "send",
      command:
        'slack send --channel "#general" --text "Hello team! Here\'s the weekly update on our project progress. We\'ve made significant improvements to the API performance.\\n\\nKey highlights:\\n- Deployment latency reduced by 40%\\n- 3 new integrations shipped\\n- Customer satisfaction up to 94%\\n\\nGreat work everyone!"',
    },
  },
  {
    id: "inbox-2",
    title: "Classify 12 new support tickets",
    status: "running",
    agentName: "Support Bot",
    agentId: "agent-5",
    createdAt: minutes(8),
    updatedAt: minutes(2),
  },
  {
    id: "inbox-3",
    title: "Forward Q1 report to John",
    status: "awaiting_approval",
    agentName: "Email Assistant",
    agentId: "agent-1",
    createdAt: minutes(15),
    updatedAt: minutes(5),
    toolApproval: {
      toolUseId: "tool-3",
      toolName: "google_gmail_send",
      toolInput: {
        to: "john@example.com",
        subject: "Project Update - Q1 Report",
        body: "Hi John,\n\nPlease find attached the Q1 report for your review.\n\nKey highlights:\n- Revenue increased by 15%\n- Customer satisfaction at 92%\n- New feature adoption rate of 78%\n\nLet me know if you have any questions.\n\nBest regards",
        attachment: "/documents/q1-report.pdf",
      },
      integration: "google_gmail",
      operation: "send",
      command:
        'google-gmail send --to "john@example.com" --subject "Project Update - Q1 Report" --body "Hi John,\\n\\nPlease find attached the Q1 report for your review.\\n\\nKey highlights:\\n- Revenue increased by 15%\\n- Customer satisfaction at 92%\\n- New feature adoption rate of 78%\\n\\nLet me know if you have any questions.\\n\\nBest regards" --attachment "/documents/q1-report.pdf"',
    },
  },
  {
    id: "inbox-4",
    title: "Connect to Google Analytics for monthly report",
    status: "awaiting_auth",
    agentName: "Data Analyst",
    agentId: "agent-3",
    createdAt: minutes(22),
    updatedAt: minutes(20),
    authRequest: {
      integrations: ["google_sheets", "google_drive"],
      connectedIntegrations: [],
      reason:
        "CmdClaw needs access to Google Sheets and Google Drive to generate and save the monthly analytics report.",
    },
  },
  {
    id: "inbox-5",
    title: "Forward invoice from accounting@vendor.com",
    status: "error",
    agentName: "Email Assistant",
    agentId: "agent-1",
    createdAt: hours(1),
    updatedAt: minutes(45),
    errorMessage: "IMAP connection timed out after 30s — server did not respond",
  },
  {
    id: "inbox-6",
    title: "Daily standup summary posted",
    status: "completed",
    agentName: "Slack Reporter",
    agentId: "agent-2",
    createdAt: hours(2),
    updatedAt: hours(1.5),
    toolApproval: {
      toolUseId: "tool-6",
      toolName: "slack_send",
      toolInput: {
        channel: "#engineering",
        text: "Daily standup summary for Jan 20:\n\n- Alice: Finished auth refactor, starting on billing\n- Bob: Debugging CI flakiness, paired with Charlie\n- Charlie: Shipped pagination PR, reviewing Bob's fix",
      },
      integration: "slack",
      operation: "send",
      command:
        'slack send --channel "#engineering" --text "Daily standup summary for Jan 20:\\n\\n- Alice: Finished auth refactor, starting on billing\\n- Bob: Debugging CI flakiness, paired with Charlie\\n- Charlie: Shipped pagination PR, reviewing Bob\'s fix"',
    },
  },
  {
    id: "inbox-7",
    title: "Analyze Q1 revenue trends",
    status: "paused",
    agentName: "Data Analyst",
    agentId: "agent-3",
    createdAt: hours(3),
    updatedAt: hours(2),
  },
  {
    id: "inbox-8",
    title: "Create issue for auth token refresh bug",
    status: "completed",
    agentName: "PR Reviewer",
    agentId: "agent-4",
    createdAt: hours(5),
    updatedAt: hours(4),
    toolApproval: {
      toolUseId: "tool-8",
      toolName: "github_create_issue",
      toolInput: {
        owner: "acme",
        repo: "web-app",
        title: "Fix auth token refresh race condition",
        body: "## Problem\nAuth tokens are not being refreshed correctly when multiple requests fire simultaneously.\n\n## Steps to Reproduce\n1. Open two tabs\n2. Let the token expire\n3. Both tabs try to refresh at the same time\n\n## Expected\nOnly one refresh should succeed, the other should wait.\n\n## Actual\nBoth refreshes fire, causing a 401 cascade.",
        labels: "bug,auth",
      },
      integration: "github",
      operation: "create-issue",
      command:
        'github create-issue --owner "acme" --repo "web-app" --title "Fix auth token refresh race condition" --body "## Problem\\nAuth tokens are not being refreshed correctly when multiple requests fire simultaneously." --labels "bug,auth"',
    },
  },
  {
    id: "inbox-9",
    title: "Archive read newsletters older than 30 days",
    status: "cancelled",
    agentName: "Email Assistant",
    agentId: "agent-1",
    createdAt: hours(6),
    updatedAt: hours(5.5),
  },
  {
    id: "inbox-10",
    title: "Respond to customer question about billing",
    status: "running",
    agentName: "Support Bot",
    agentId: "agent-5",
    createdAt: minutes(1),
    updatedAt: minutes(0.5),
  },
  {
    id: "inbox-11",
    title: "Create Linear issue for dashboard redesign",
    status: "awaiting_approval",
    agentName: "PR Reviewer",
    agentId: "agent-4",
    createdAt: minutes(10),
    updatedAt: minutes(7),
    toolApproval: {
      toolUseId: "tool-11",
      toolName: "linear_create",
      toolInput: {
        team: "PRODUCT",
        title: "Redesign analytics dashboard",
        description:
          "The current analytics dashboard needs a visual refresh to match our new design system.\n\nScope:\n- Update chart components to use new color palette\n- Add dark mode support\n- Improve mobile responsiveness\n- Add export to PDF functionality",
        priority: "2",
      },
      integration: "linear",
      operation: "create",
      command:
        'linear create --team "PRODUCT" --title "Redesign analytics dashboard" --description "The current analytics dashboard needs a visual refresh to match our new design system." --priority "2"',
    },
  },
];
