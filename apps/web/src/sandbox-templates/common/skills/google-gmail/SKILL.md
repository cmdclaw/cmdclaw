---
name: google-gmail
description: Read, search, draft, and send Gmail emails. Use for listing emails, searching the mailbox, reading content, counting unread, drafting messages, and sending messages.
---

# Google Gmail

Read inbox, get email content, count unread, fetch latest email, draft emails, and send emails via Gmail API.

## Environment Variables

- `GMAIL_ACCESS_TOKEN` - Google OAuth2 access token with Gmail scope
- `CMDCLAW_USER_TIMEZONE` - IANA timezone (for plain local date output, e.g. `Europe/Dublin`)

## Commands

```bash
# List emails (supports Gmail search syntax, defaults to Inbox)
google-gmail list [-q "from:boss subject:urgent"] [-l limit] [--scope inbox|all|strict-all] [--include-spam-trash]

# Search mailbox (defaults to all mail except spam/trash)
google-gmail search -q "from:boss subject:urgent" [-l limit] [--scope inbox|all|strict-all] [--include-spam-trash]

# Get latest email (defaults to Inbox)
google-gmail latest [-q "from:boss"] [--unread] [--scope inbox|all|strict-all] [--include-spam-trash]

# Get full email content
google-gmail get <messageId>

# Count unread emails (defaults to Inbox)
google-gmail unread [-q "from:boss"] [--scope inbox|all|strict-all] [--include-spam-trash]

# Draft an email
google-gmail draft --to "user@example.com" --subject "Hello" --body "Message text" [--cc "cc@example.com"]

# Send an email
google-gmail send --to "user@example.com" --subject "Hello" --body "Message text" [--cc "cc@example.com"]
```

## Email Body Formatting

- Email body is sent as HTML.
- Allowed tags: `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<br>`, `<p>`.
- Unsupported tags cause command failure.
- Attributes on allowed tags are not allowed.
- Markdown remains literal text (no Markdown-to-HTML conversion).

## Scope behavior

- `--scope inbox` (default): only messages in `INBOX`
- `--scope all`: all mailbox messages except spam/trash (unless `--include-spam-trash`)
- `--scope strict-all`: includes spam/trash by default

## Output Format

JSON arrays. Example for `list` / `search`:

```json
[
  { "id": "18d3f...", "subject": "Meeting Tomorrow", "from": "John <john@example.com>", "date": "2024-01-15 10:00:00", "snippet": "Preview text..." }
]
```
