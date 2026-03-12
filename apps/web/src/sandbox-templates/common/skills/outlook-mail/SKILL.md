---
name: outlook
description: Read, search, and send Outlook emails. Use for listing emails, searching the mailbox, reading content, counting unread, and sending messages.
---

# Outlook Mail

Read inbox emails, get email content, count unread emails, and send messages via Microsoft Graph.

## Environment Variables

- `OUTLOOK_ACCESS_TOKEN` - Microsoft OAuth2 access token with Mail scopes

## Commands

```bash
# List emails
outlook-mail list [-l limit]

# Search mailbox
outlook-mail search -q "subject keyword" [-l limit]

# Get full email content
outlook-mail get <messageId>

# Count unread emails
outlook-mail unread [-q "subject keyword"] [-l limit]

# Send an email
outlook-mail send --to "user@example.com" --subject "Hello" --body "Message text" [--cc "cc@example.com"]
```

## Email Body Formatting

- Email body is sent as HTML.
- Allowed tags: `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<br>`, `<p>`.
- Unsupported tags cause command failure.
- Attributes on allowed tags are not allowed.
- Markdown remains literal text (no Markdown-to-HTML conversion).

## Output Format

JSON arrays/objects for read operations.
