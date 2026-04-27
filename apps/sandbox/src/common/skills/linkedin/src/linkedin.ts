import { parseArgs } from "util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonValue = ReturnType<typeof JSON.parse>;

const CLI_ARGS = process.argv.slice(2);
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY ?? "";
const UNIPILE_DSN = process.env.UNIPILE_DSN ?? "";
const LINKEDIN_ACCOUNT_ID = process.env.LINKEDIN_ACCOUNT_ID ?? "";

export function buildUnipileBaseUrl(dsn: string): string {
  const normalizedDsn = dsn
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  return normalizedDsn ? `https://${normalizedDsn}/api/v1` : "";
}

const BASE_URL = buildUnipileBaseUrl(UNIPILE_DSN);
const headers = {
  "X-API-KEY": UNIPILE_API_KEY,
  "Content-Type": "application/json",
  Accept: "application/json",
};

async function api<T = JsonValue>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Unipile API Error (${res.status}): ${error}`);
  }

  return (await res.json()) as T;
}

const { positionals, values } = parseArgs({
  args: CLI_ARGS,
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
    limit: { type: "string", short: "l", default: "20" },
    text: { type: "string", short: "t" },
    query: { type: "string", short: "q" },
    message: { type: "string", short: "m" },
    profile: { type: "string", short: "p" },
    type: { type: "string" },
    visibility: { type: "string", default: "PUBLIC" },
    cursor: { type: "string" },
  },
});

const [command, subcommand, ...args] = positionals;

type UserSummary = {
  id: string | null;
  name: string | null;
  username: string | null;
  headline: string | null;
  profileUrl: string | null;
};

const userSummaryCache = new Map<string, Promise<UserSummary | null>>();

export function normalizeLinkedInProfileIdentifier(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  const value = raw.trim();
  if (value.length === 0) {
    return null;
  }

  const linkedinPathMatch = value.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (linkedinPathMatch?.[1]) {
    return linkedinPathMatch[1];
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return null;
  }

  return value;
}

export function normalizeLinkedInCompanyIdentifier(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }

  const value = raw.trim();
  if (value.length === 0) {
    return null;
  }

  const linkedinPathMatch = value.match(/linkedin\.com\/company\/([^/?#]+)/i);
  if (linkedinPathMatch?.[1]) {
    return linkedinPathMatch[1];
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return null;
  }

  return value;
}

function ensureConfigured(): void {
  if (UNIPILE_API_KEY && LINKEDIN_ACCOUNT_ID && BASE_URL) {
    return;
  }

  console.error(
    "Error: UNIPILE_API_KEY, UNIPILE_DSN, and LINKEDIN_ACCOUNT_ID environment variables required",
  );
  process.exit(1);
}

async function getUserSummary(providerId: unknown): Promise<UserSummary | null> {
  if (typeof providerId !== "string" || providerId.length === 0) {
    return null;
  }

  const cached = userSummaryCache.get(providerId);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    try {
      const profile = await api<Record<string, JsonValue>>(
        `/users/${encodeURIComponent(providerId)}?account_id=${LINKEDIN_ACCOUNT_ID}`,
      );
      const firstName = typeof profile.first_name === "string" ? profile.first_name : "";
      const lastName = typeof profile.last_name === "string" ? profile.last_name : "";
      const fullName = `${firstName} ${lastName}`.trim();

      return {
        id: typeof profile.provider_id === "string" ? profile.provider_id : null,
        name:
          (typeof profile.display_name === "string" ? profile.display_name : null) ||
          (fullName.length > 0 ? fullName : null),
        username: normalizeLinkedInProfileIdentifier(profile.public_identifier),
        headline: typeof profile.headline === "string" ? profile.headline : null,
        profileUrl: normalizeLinkedInProfileIdentifier(profile.public_identifier),
      };
    } catch {
      return null;
    }
  })();

  userSummaryCache.set(providerId, promise);
  return promise;
}

async function getLatestMessage(chatId: string): Promise<Record<string, JsonValue> | null> {
  const params = new URLSearchParams({
    account_id: LINKEDIN_ACCOUNT_ID!,
    limit: "1",
  });
  const response = await api<Record<string, JsonValue>>(`/chats/${chatId}/messages?${params}`);
  const items = Array.isArray(response.items) ? response.items : [];
  const firstItem = items[0];

  if (!firstItem || typeof firstItem !== "object") {
    return null;
  }

  return firstItem as Record<string, JsonValue>;
}

// ========== MESSAGING ==========

async function listChats() {
  const limit = parseInt(values.limit || "20");
  const params = new URLSearchParams({
    account_id: LINKEDIN_ACCOUNT_ID!,
    limit: limit.toString(),
  });
  if (values.cursor) {
    params.set("cursor", values.cursor);
  }

  const data = await api(`/chats?${params}`);
  const items = Array.isArray(data.items) ? (data.items as Record<string, JsonValue>[]) : [];
  const chats = await Promise.all(
    items.map(async (c) => {
      const participant = await getUserSummary(c.attendee_provider_id);
      const latestMessage = await getLatestMessage(String(c.id));
      const latestMessageSender = await getUserSummary(latestMessage?.sender_id);
      const latestText =
        typeof latestMessage?.text === "string" ? latestMessage.text.slice(0, 100) : null;

      return {
        id: c.id,
        participant,
        lastMessage: latestText,
        lastMessageSenderUsername: latestMessageSender?.username ?? null,
        lastMessageSenderName: latestMessageSender?.name ?? null,
        unreadCount: c.unread_count,
        updatedAt: c.updated_at ?? c.timestamp ?? null,
      };
    }),
  );

  console.log(JSON.stringify({ items: chats, cursor: data.cursor }, null, 2));
}

async function getChat(chatId: string) {
  const data = await api<Record<string, JsonValue>>(
    `/chats/${chatId}?account_id=${LINKEDIN_ACCOUNT_ID}`,
  );
  const participant = await getUserSummary(data.attendee_provider_id);
  const latestMessage = await getLatestMessage(chatId);
  const latestMessageSender = await getUserSummary(latestMessage?.sender_id);

  console.log(
    JSON.stringify(
      {
        id: data.id,
        participant,
        lastMessage: typeof latestMessage?.text === "string" ? latestMessage.text : null,
        lastMessageSenderUsername: latestMessageSender?.username ?? null,
        lastMessageSenderName: latestMessageSender?.name ?? null,
        unreadCount: data.unread_count,
        createdAt: data.created_at,
        updatedAt: data.updated_at ?? data.timestamp ?? null,
      },
      null,
      2,
    ),
  );
}

async function listMessages(chatId: string) {
  const limit = parseInt(values.limit || "20");
  const params = new URLSearchParams({
    account_id: LINKEDIN_ACCOUNT_ID!,
    limit: limit.toString(),
  });
  if (values.cursor) {
    params.set("cursor", values.cursor);
  }

  const data = await api(`/chats/${chatId}/messages?${params}`);
  const items = Array.isArray(data.items) ? (data.items as Record<string, JsonValue>[]) : [];
  const messages = await Promise.all(
    items.map(async (m) => {
      const sender = await getUserSummary(m.sender_id ?? m.sender?.provider_id);
      return {
        id: m.id,
        text: m.text,
        senderName: sender?.name ?? null,
        senderUsername: sender?.username ?? null,
        timestamp: m.timestamp,
        isFromMe: Boolean(m.is_from_me ?? m.is_sender),
      };
    }),
  );

  console.log(JSON.stringify({ items: messages, cursor: data.cursor }, null, 2));
}

async function sendMessage(chatId: string, text: string) {
  const data = await api(`/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      account_id: LINKEDIN_ACCOUNT_ID,
      text,
    }),
  });
  console.log(JSON.stringify({ success: true, messageId: data.message_id }, null, 2));
}

async function startChat(attendeeId: string, message: string) {
  const data = await api("/chats", {
    method: "POST",
    body: JSON.stringify({
      account_id: LINKEDIN_ACCOUNT_ID,
      attendees_ids: [attendeeId],
      text: message,
    }),
  });
  console.log(JSON.stringify({ success: true, chatId: data.chat_id }, null, 2));
}

// ========== PROFILES ==========

async function getMyProfile() {
  const data = await api<Record<string, JsonValue>>(`/users/me?account_id=${LINKEDIN_ACCOUNT_ID}`);
  let headline = typeof data.headline === "string" ? data.headline : null;

  if (
    !headline &&
    typeof data.public_identifier === "string" &&
    data.public_identifier.length > 0
  ) {
    const fullProfile = await api<Record<string, JsonValue>>(
      `/users/${encodeURIComponent(data.public_identifier)}?account_id=${LINKEDIN_ACCOUNT_ID}`,
    );
    headline = typeof fullProfile.headline === "string" ? fullProfile.headline : null;
  }

  console.log(
    JSON.stringify(
      {
        id: data.provider_id,
        name: data.display_name,
        headline,
        location: data.location,
        profileUrl: data.public_identifier,
        connectionsCount: data.connections_count,
      },
      null,
      2,
    ),
  );
}

async function getProfile(identifier: string) {
  const normalizedIdentifier = normalizeLinkedInProfileIdentifier(identifier) ?? identifier;
  const data = await api(
    `/users/${encodeURIComponent(normalizedIdentifier)}?account_id=${LINKEDIN_ACCOUNT_ID}`,
  );
  console.log(
    JSON.stringify(
      {
        id: data.provider_id,
        name: data.display_name,
        headline: data.headline,
        location: data.location,
        profileUrl: data.public_identifier,
        connectionsCount: data.connections_count,
        company: data.current_company,
        summary: data.summary,
      },
      null,
      2,
    ),
  );
}

async function getCompanyProfile(identifier: string) {
  const normalizedIdentifier = normalizeLinkedInCompanyIdentifier(identifier) ?? identifier;
  const data = await api(
    `/linkedin/company/${encodeURIComponent(normalizedIdentifier)}?account_id=${LINKEDIN_ACCOUNT_ID}`,
  );
  console.log(
    JSON.stringify(
      {
        id: data.id,
        name: data.name,
        description: data.description,
        industry: data.industry,
        employeeCount: data.employee_count,
        website: data.website,
        headquarters: Array.isArray(data.locations)
          ? (data.locations.find(
              (location): location is Record<string, JsonValue> =>
                typeof location === "object" &&
                location !== null &&
                location.is_headquarter === true,
            ) ?? null)
          : null,
      },
      null,
      2,
    ),
  );
}

async function searchUsers(query: string) {
  const limit = parseInt(values.limit || "20");
  const params = new URLSearchParams({
    account_id: LINKEDIN_ACCOUNT_ID!,
    limit: limit.toString(),
  });
  if (values.cursor) {
    params.set("cursor", values.cursor);
  }

  const data = await api(`/linkedin/search?${params}`, {
    method: "POST",
    body: JSON.stringify({
      api: "classic",
      category: "people",
      keywords: query,
    }),
  });

  const items = Array.isArray(data.items) ? (data.items as Record<string, JsonValue>[]) : [];
  const users = items.map((u) => ({
    id: u.id ?? u.provider_id ?? null,
    name:
      typeof u.name === "string"
        ? u.name
        : typeof u.display_name === "string"
          ? u.display_name
          : null,
    headline: typeof u.headline === "string" ? u.headline : null,
    profileUrl:
      normalizeLinkedInProfileIdentifier(u.public_identifier) ??
      normalizeLinkedInProfileIdentifier(u.profile_url) ??
      null,
    location: typeof u.location === "string" ? u.location : null,
  }));

  console.log(JSON.stringify({ items: users, cursor: data.cursor }, null, 2));
}

// ========== INVITATIONS & CONNECTIONS ==========

async function sendInvitation(profileId: string, message?: string) {
  const body: Record<string, JsonValue> = {
    account_id: LINKEDIN_ACCOUNT_ID,
    provider_id: profileId,
  };
  if (message) {
    body.message = message;
  }

  await api("/users/invite", {
    method: "POST",
    body: JSON.stringify(body),
  });
  console.log(
    JSON.stringify({ success: true, message: `Invitation sent to ${profileId}` }, null, 2),
  );
}

async function listPendingInvitations() {
  const limit = parseInt(values.limit || "20");
  const data = await api(`/users/invitations?account_id=${LINKEDIN_ACCOUNT_ID}&limit=${limit}`);

  const invitations =
    data.items?.map((i: Record<string, JsonValue>) => ({
      id: i.provider_id,
      name: i.display_name,
      headline: i.headline,
      sentAt: i.sent_at,
      direction: i.direction,
    })) || [];

  console.log(JSON.stringify({ items: invitations, cursor: data.cursor }, null, 2));
}

async function listConnections() {
  const limit = parseInt(values.limit || "50");
  const params = new URLSearchParams({
    account_id: LINKEDIN_ACCOUNT_ID!,
    limit: limit.toString(),
  });
  if (values.cursor) {
    params.set("cursor", values.cursor);
  }

  const data = await api(`/users/relations?${params}`);

  const connections =
    data.items?.map((c: Record<string, JsonValue>) => ({
      id: c.provider_id,
      name: c.display_name,
      headline: c.headline,
      connectedAt: c.connected_at,
    })) || [];

  console.log(JSON.stringify({ items: connections, cursor: data.cursor }, null, 2));
}

async function removeConnection(profileId: string) {
  await api(`/users/relations/${profileId}?account_id=${LINKEDIN_ACCOUNT_ID}`, {
    method: "DELETE",
  });
  console.log(
    JSON.stringify({ success: true, message: `Connection removed: ${profileId}` }, null, 2),
  );
}

// ========== POSTS & CONTENT ==========

async function createPost(text: string, visibility = "PUBLIC") {
  const data = await api("/posts", {
    method: "POST",
    body: JSON.stringify({
      account_id: LINKEDIN_ACCOUNT_ID,
      text,
      visibility,
    }),
  });
  console.log(JSON.stringify({ success: true, postId: data.post_id }, null, 2));
}

async function getPost(postId: string) {
  const data = await api(`/posts/${postId}?account_id=${LINKEDIN_ACCOUNT_ID}`);
  console.log(
    JSON.stringify(
      {
        id: data.id,
        text: data.text,
        author: {
          id: data.author?.provider_id,
          name: data.author?.display_name,
        },
        likesCount: data.likes_count,
        commentsCount: data.comments_count,
        sharesCount: data.shares_count,
        createdAt: data.created_at,
      },
      null,
      2,
    ),
  );
}

function mapPostSummary(post: Record<string, JsonValue>) {
  const author =
    typeof post.author === "object" && post.author !== null
      ? (post.author as Record<string, JsonValue>)
      : null;

  return {
    id: post.social_id ?? post.id ?? null,
    text: typeof post.text === "string" ? post.text.slice(0, 200) : null,
    author:
      typeof author?.name === "string"
        ? author.name
        : typeof author?.display_name === "string"
          ? author.display_name
          : null,
    likesCount:
      typeof post.reaction_counter === "number"
        ? post.reaction_counter
        : typeof post.likes_count === "number"
          ? post.likes_count
          : null,
    commentsCount:
      typeof post.comment_counter === "number"
        ? post.comment_counter
        : typeof post.comments_count === "number"
          ? post.comments_count
          : null,
    sharesCount:
      typeof post.repost_counter === "number"
        ? post.repost_counter
        : typeof post.shares_count === "number"
          ? post.shares_count
          : null,
    createdAt:
      typeof post.parsed_datetime === "string"
        ? post.parsed_datetime
        : typeof post.created_at === "string"
          ? post.created_at
          : null,
    shareUrl: typeof post.share_url === "string" ? post.share_url : null,
  };
}

async function resolveProfileProviderId(identifier?: string): Promise<string> {
  if (!identifier) {
    const me = await api<Record<string, JsonValue>>(`/users/me?account_id=${LINKEDIN_ACCOUNT_ID}`);
    if (typeof me.provider_id !== "string" || me.provider_id.length === 0) {
      throw new Error("Could not resolve the current LinkedIn profile provider ID.");
    }
    return me.provider_id;
  }

  const normalizedIdentifier = normalizeLinkedInProfileIdentifier(identifier) ?? identifier;
  const profile = await api<Record<string, JsonValue>>(
    `/users/${encodeURIComponent(normalizedIdentifier)}?account_id=${LINKEDIN_ACCOUNT_ID}`,
  );

  if (typeof profile.provider_id !== "string" || profile.provider_id.length === 0) {
    throw new Error(`Could not resolve LinkedIn provider ID for profile: ${identifier}`);
  }

  return profile.provider_id;
}

async function resolveCompanyProviderId(identifier: string): Promise<string> {
  const normalizedIdentifier = normalizeLinkedInCompanyIdentifier(identifier) ?? identifier;
  const company = await api<Record<string, JsonValue>>(
    `/linkedin/company/${encodeURIComponent(normalizedIdentifier)}?account_id=${LINKEDIN_ACCOUNT_ID}`,
  );

  if (typeof company.id !== "string" || company.id.length === 0) {
    throw new Error(`Could not resolve LinkedIn company ID for: ${identifier}`);
  }

  return company.id;
}

async function listPosts(profileId?: string) {
  const providerId = await resolveProfileProviderId(profileId);
  const limit = parseInt(values.limit || "20");
  const params = new URLSearchParams({
    account_id: LINKEDIN_ACCOUNT_ID!,
    limit: limit.toString(),
  });
  if (values.cursor) {
    params.set("cursor", values.cursor);
  }

  const data = await api(`/users/${encodeURIComponent(providerId)}/posts?${params}`);

  const items = Array.isArray(data.items) ? (data.items as Record<string, JsonValue>[]) : [];
  const posts = items.map(mapPostSummary);

  console.log(JSON.stringify({ items: posts, cursor: data.cursor }, null, 2));
}

async function commentOnPost(postId: string, text: string) {
  const data = await api(`/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify({
      account_id: LINKEDIN_ACCOUNT_ID,
      text,
    }),
  });
  console.log(JSON.stringify({ success: true, commentId: data.comment_id }, null, 2));
}

async function reactToPost(postId: string, reactionType: string) {
  await api("/posts/reaction", {
    method: "POST",
    body: JSON.stringify({
      account_id: LINKEDIN_ACCOUNT_ID,
      post_id: postId,
      reaction_type: reactionType.toUpperCase(),
    }),
  });
  console.log(JSON.stringify({ success: true, message: `Reacted with ${reactionType}` }, null, 2));
}

// ========== COMPANY PAGES ==========

async function listCompanyPosts(companyId: string) {
  const providerId = await resolveCompanyProviderId(companyId);
  const limit = parseInt(values.limit || "20");
  const params = new URLSearchParams({
    account_id: LINKEDIN_ACCOUNT_ID!,
    limit: limit.toString(),
    is_company: "true",
  });
  if (values.cursor) {
    params.set("cursor", values.cursor);
  }

  const data = await api(`/users/${encodeURIComponent(providerId)}/posts?${params}`);

  const items = Array.isArray(data.items) ? (data.items as Record<string, JsonValue>[]) : [];
  const posts = items.map(mapPostSummary);

  console.log(JSON.stringify({ items: posts, cursor: data.cursor }, null, 2));
}

async function createCompanyPost(companyId: string, text: string) {
  const organizationId = await resolveCompanyProviderId(companyId);
  const data = await api("/posts", {
    method: "POST",
    body: JSON.stringify({
      account_id: LINKEDIN_ACCOUNT_ID,
      as_organization: organizationId,
      text,
    }),
  });
  console.log(JSON.stringify({ success: true, postId: data.post_id }, null, 2));
}

// ========== HELP ==========

function showHelp() {
  console.log(`LinkedIn CLI (via Unipile) - Commands:

MESSAGING
  linkedin chats list [-l limit]                      List conversations
  linkedin chats get <chatId>                         Get conversation details
  linkedin messages list <chatId> [-l limit]          List messages in chat
  linkedin messages send <chatId> --text <message>    Send message
  linkedin messages start <profileId> --text <msg>    Start new conversation

PROFILES
  linkedin profile me                                 Get my profile
  linkedin profile get <identifier>                   Get user profile (URL or ID)
  linkedin profile company <identifier>               Get company profile
  linkedin search -q <query> [-l limit]               Search for people

INVITATIONS & CONNECTIONS
  linkedin invite send <profileId> [--message <m>]    Send connection request
  linkedin invite list                                List pending invitations
  linkedin connections list [-l limit]                List my connections
  linkedin connections remove <profileId>             Remove connection

POSTS & CONTENT
  linkedin posts list [--profile <id>] [-l limit]     List posts
  linkedin posts get <postId>                         Get post details
  linkedin posts create --text <content>              Create a post
  linkedin posts comment <postId> --text <comment>    Comment on post
  linkedin posts react <postId> --type <LIKE|...>     React to post
    Reaction types: LIKE, CELEBRATE, SUPPORT, LOVE, INSIGHTFUL, FUNNY

COMPANY PAGES
  linkedin company posts <companyId> [-l limit]       List company posts
  linkedin company post <companyId> --text <text>     Post as company (if admin)

Options:
  -h, --help                                          Show this help message
  -l, --limit <n>                                     Limit results (default: 20)
  -t, --text <text>                                   Text content
  -q, --query <query>                                 Search query
  -m, --message <msg>                                 Message text
  --profile <id>                                      Profile identifier
  --type <type>                                       Reaction type
  --visibility <PUBLIC|CONNECTIONS>                   Post visibility`);
}

// ========== MAIN ==========

async function main() {
  if (values.help || !command) {
    showHelp();
    return;
  }

  ensureConfigured();

  try {
    switch (command) {
      case "chats":
        switch (subcommand) {
          case "list":
            await listChats();
            break;
          case "get":
            if (!args[0]) {
              console.error("Error: Chat ID required");
              process.exit(1);
            }
            await getChat(args[0]);
            break;
          default:
            console.error(`Unknown chats subcommand: ${subcommand}`);
            showHelp();
        }
        break;

      case "messages":
        switch (subcommand) {
          case "list":
            if (!args[0]) {
              console.error("Error: Chat ID required");
              process.exit(1);
            }
            await listMessages(args[0]);
            break;
          case "send":
            if (!args[0] || !values.text) {
              console.error("Error: Chat ID and --text required");
              process.exit(1);
            }
            await sendMessage(args[0], values.text);
            break;
          case "start":
            if (!args[0] || !values.text) {
              console.error("Error: Profile ID and --text required");
              process.exit(1);
            }
            await startChat(args[0], values.text);
            break;
          default:
            console.error(`Unknown messages subcommand: ${subcommand}`);
            showHelp();
        }
        break;

      case "profile":
        switch (subcommand) {
          case "me":
            await getMyProfile();
            break;
          case "get":
            if (!args[0]) {
              console.error("Error: Profile identifier required");
              process.exit(1);
            }
            await getProfile(args[0]);
            break;
          case "company":
            if (!args[0]) {
              console.error("Error: Company identifier required");
              process.exit(1);
            }
            await getCompanyProfile(args[0]);
            break;
          default:
            console.error(`Unknown profile subcommand: ${subcommand}`);
            showHelp();
        }
        break;

      case "search":
        if (!values.query) {
          console.error("Error: --query required");
          process.exit(1);
        }
        await searchUsers(values.query);
        break;

      case "invite":
        switch (subcommand) {
          case "send":
            if (!args[0]) {
              console.error("Error: Profile ID required");
              process.exit(1);
            }
            await sendInvitation(args[0], values.message);
            break;
          case "list":
            await listPendingInvitations();
            break;
          default:
            console.error(`Unknown invite subcommand: ${subcommand}`);
            showHelp();
        }
        break;

      case "connections":
        switch (subcommand) {
          case "list":
            await listConnections();
            break;
          case "remove":
            if (!args[0]) {
              console.error("Error: Profile ID required");
              process.exit(1);
            }
            await removeConnection(args[0]);
            break;
          default:
            console.error(`Unknown connections subcommand: ${subcommand}`);
            showHelp();
        }
        break;

      case "posts":
        switch (subcommand) {
          case "list":
            await listPosts(values.profile);
            break;
          case "get":
            if (!args[0]) {
              console.error("Error: Post ID required");
              process.exit(1);
            }
            await getPost(args[0]);
            break;
          case "create":
            if (!values.text) {
              console.error("Error: --text required");
              process.exit(1);
            }
            await createPost(values.text, values.visibility);
            break;
          case "comment":
            if (!args[0] || !values.text) {
              console.error("Error: Post ID and --text required");
              process.exit(1);
            }
            await commentOnPost(args[0], values.text);
            break;
          case "react":
            if (!args[0] || !values.type) {
              console.error("Error: Post ID and --type required");
              process.exit(1);
            }
            await reactToPost(args[0], values.type);
            break;
          default:
            console.error(`Unknown posts subcommand: ${subcommand}`);
            showHelp();
        }
        break;

      case "company":
        switch (subcommand) {
          case "posts":
            if (!args[0]) {
              console.error("Error: Company ID required");
              process.exit(1);
            }
            await listCompanyPosts(args[0]);
            break;
          case "post":
            if (!args[0] || !values.text) {
              console.error("Error: Company ID and --text required");
              process.exit(1);
            }
            await createCompanyPost(args[0], values.text);
            break;
          default:
            console.error(`Unknown company subcommand: ${subcommand}`);
            showHelp();
        }
        break;

      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
    }
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          error: true,
          message: error instanceof Error ? error.message : "Unknown error",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  main();
}
