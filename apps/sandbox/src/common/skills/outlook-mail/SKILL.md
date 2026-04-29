---
name: outlook
description: Read, search, draft, and send Outlook emails, and look up Outlook people contacts. Use for listing emails, searching the mailbox, reading content, counting unread, finding contacts, drafting messages, and sending messages.
---

# Outlook Mail

Read inbox emails, get email content, count unread emails, find people contacts, draft messages, and send messages via Microsoft Graph.

## Environment Variables

- `OUTLOOK_ACCESS_TOKEN` - Microsoft OAuth2 access token with Outlook Mail and People scopes, including draft creation and contact lookup support

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

# Find a person/contact by name or email
outlook-mail contact -q "Jane Doe" [-l limit]

# Draft an email
outlook-mail draft --to "user@example.com" --subject "Hello" --body "Message text" [--cc "cc@example.com"] [--attachment /tmp/report.pdf]

# Send an email
outlook-mail send --to "user@example.com" --subject "Hello" --body "Message text" [--cc "cc@example.com"] [--attachment /tmp/report.pdf]
```

## Email Body Formatting

- Email body is sent as HTML.
- Allowed tags: `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<br>`, `<p>`.
- Unsupported tags cause command failure.
- Attributes on allowed tags are not allowed.
- Markdown remains literal text (no Markdown-to-HTML conversion).

## Output Format

JSON arrays/objects for read operations.
