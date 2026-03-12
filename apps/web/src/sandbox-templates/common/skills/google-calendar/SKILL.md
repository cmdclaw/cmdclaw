---
name: google-calendar
description: Manage Google Calendar events. Use for listing, creating, updating, and deleting calendar events.
---

# Google Calendar

Read and write Google Calendar events, search for matching events, and compute free time windows.

## Environment Variables

- `GOOGLE_CALENDAR_ACCESS_TOKEN` - Google OAuth2 access token with calendar scope

## Commands

```bash
# List upcoming events
google-calendar list [-l limit] [-t timeMin] [-m timeMax] [-c calendarId]

# Search events by title, text, or attendee email
google-calendar search [-q "sprint review"] [--attendee "samuel@example.com"] [--next] [-l limit] [-t timeMin] [-m timeMax] [-c calendarId]

# Return free slots in a window
google-calendar availability --from 2024-01-15T09:00:00Z --to 2024-01-15T18:00:00Z [--duration 30m] [--workday-start 09:00] [--workday-end 18:00] [-l limit] [-c calendarId]

# Get event details
google-calendar get <eventId> [-c calendarId]

# Create an event
google-calendar create --summary "Meeting" --start 2024-01-15T09:00:00 --end 2024-01-15T10:00:00 [--description "Notes"] [--location "Office"] [--attendees "a@x.com,b@x.com"]

# Create all-day event
google-calendar create --summary "Holiday" --start 2024-01-15 --end 2024-01-16

# Update an event
google-calendar update <eventId> [--summary "New title"] [--start ...] [--end ...]

# Delete an event
google-calendar delete <eventId>

# List available calendars
google-calendar calendars

# List today's events
google-calendar today [-c calendarId]
```

## Output Format

JSON arrays for `list` and `search`. Example:

```json
[
  { "id": "abc123", "summary": "Team Standup", "start": "2024-01-15T09:00:00-05:00", "end": "2024-01-15T09:30:00-05:00", "location": "Room 1" }
]
```

`availability` returns a JSON object with `nextAvailable` and `slots`.
