import { env } from "../../env";

const OPS_TELEMETRY_CHANNEL_NAME = "ops-daily";

function normalizeSlackChannelName(value: string): string {
  return value.trim().replace(/^#/, "").toLowerCase();
}

async function slackApi(method: string, body: Record<string, unknown>) {
  if (!env.SLACK_BOT_TOKEN) {
    throw new Error("SLACK_BOT_TOKEN is required to post telemetry updates to Slack");
  }

  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return (await response.json()) as {
    ok: boolean;
    error?: string;
    warning?: string;
    [key: string]: unknown;
  };
}

async function lookupSlackChannelIdByName(channelName: string): Promise<string> {
  if (!env.SLACK_BOT_TOKEN) {
    throw new Error("SLACK_BOT_TOKEN is required to post telemetry updates to Slack");
  }

  const targetName = normalizeSlackChannelName(channelName);

  const lookupPage = async (cursor?: string): Promise<string> => {
    const params = new URLSearchParams({
      exclude_archived: "true",
      limit: "200",
      types: "public_channel,private_channel,mpim",
    });
    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      },
    });

    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
      channels?: Array<{ id: string; name?: string; name_normalized?: string }>;
      response_metadata?: { next_cursor?: string };
    };

    if (!result.ok) {
      throw new Error(result.error ?? "Could not list Slack channels");
    }

    const match = result.channels?.find((channel) => {
      const name = channel.name_normalized ?? channel.name;
      return typeof name === "string" && normalizeSlackChannelName(name) === targetName;
    });
    if (match?.id) {
      return match.id;
    }

    const nextCursor = result.response_metadata?.next_cursor?.trim();
    if (!nextCursor) {
      throw new Error(`Slack channel not found: ${channelName}`);
    }

    return lookupPage(nextCursor);
  };

  return lookupPage();
}

async function ensureBotJoinedSlackChannel(channelId: string): Promise<void> {
  const result = await slackApi("conversations.join", { channel: channelId });
  if (!result.ok && result.error !== "already_in_channel") {
    throw new Error(result.error ?? "Could not join telemetry Slack channel");
  }
}

async function postSlackMessage(channelId: string, text: string): Promise<void> {
  await ensureBotJoinedSlackChannel(channelId);
  const result = await slackApi("chat.postMessage", {
    channel: channelId,
    text,
  });
  if (!result.ok) {
    throw new Error(result.error ?? "Could not post telemetry update to Slack");
  }
}

export async function postMessageToOpsTelemetryChannel(text: string): Promise<boolean> {
  if (!env.SLACK_BOT_TOKEN) {
    return false;
  }

  const channelId = await lookupSlackChannelIdByName(OPS_TELEMETRY_CHANNEL_NAME);
  await postSlackMessage(channelId, text);
  return true;
}

export function buildSignupSlackMessage(params: {
  email: string;
  name?: string | null;
  signupMethod?: string;
  userId: string;
  occurredAt: Date;
}): string {
  const lines = [
    "New CmdClaw signup",
    "",
    `Email: ${params.email}`,
    `Method: ${params.signupMethod ?? "unknown"}`,
  ];

  if (params.name?.trim()) {
    lines.push(`Name: ${params.name.trim()}`);
  }

  lines.push(`User ID: ${params.userId}`, `Created at: ${params.occurredAt.toISOString()}`);

  return lines.join("\n");
}

export async function postSignupSlackNotification(params: {
  email: string;
  name?: string | null;
  signupMethod?: string;
  userId: string;
  occurredAt: Date;
}): Promise<boolean> {
  return postMessageToOpsTelemetryChannel(buildSignupSlackMessage(params));
}
