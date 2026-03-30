export type InboxItemStatus = "awaiting_approval" | "awaiting_auth" | "error";

export type ToolApprovalData = {
  toolUseId: string;
  toolName: string;
  toolInput: unknown;
  integration: string;
  operation: string;
  command?: string;
};

export type AuthRequestData = {
  integrations: string[];
  connectedIntegrations: string[];
  reason?: string;
};

export type InboxCoworkerItem = {
  kind: "coworker";
  id: string;
  runId: string;
  coworkerId: string;
  coworkerName: string;
  builderAvailable: boolean;
  title: string;
  status: InboxItemStatus;
  updatedAt: Date;
  createdAt: Date;
  generationId: string | null;
  conversationId: string | null;
  errorMessage: string | null;
  pendingApproval?: ToolApprovalData;
  pendingAuth?: AuthRequestData;
};

export type InboxChatItem = {
  kind: "chat";
  id: string;
  conversationId: string;
  conversationTitle: string;
  title: string;
  status: InboxItemStatus;
  updatedAt: Date;
  createdAt: Date;
  generationId: string | null;
  errorMessage: string | null;
  pendingApproval?: ToolApprovalData;
  pendingAuth?: AuthRequestData;
};

export type InboxItem = InboxCoworkerItem | InboxChatItem;

export type InboxSourceOption = {
  coworkerId: string;
  coworkerName: string;
};
