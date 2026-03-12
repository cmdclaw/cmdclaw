import { pathToFileURL } from "url";
import { parseArgs } from "util";

const BASE_URL = "https://www.googleapis.com/calendar/v3";
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WORKDAY_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

type CalendarDateTime = { dateTime?: string; date?: string; timeZone?: string };
export type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  start?: CalendarDateTime;
  end?: CalendarDateTime;
  location?: string;
  status?: string;
  attendees?: Array<{ email?: string; responseStatus?: string }>;
  htmlLink?: string;
  creator?: unknown;
  organizer?: unknown;
};

type CliValues = {
  help?: boolean;
  next?: boolean;
  limit?: string;
  timeMin?: string;
  timeMax?: string;
  calendar?: string;
  summary?: string;
  description?: string;
  start?: string;
  end?: string;
  location?: string;
  attendees?: string;
  query?: string;
  from?: string;
  to?: string;
  duration?: string;
  "workday-start"?: string;
  "workday-end"?: string;
  attendee?: string;
};

type ParsedCli = {
  command?: string;
  args: string[];
  values: CliValues;
};

type AvailabilityRequest = {
  from: string;
  to: string;
  durationMinutes: number;
  limit: number;
  workdayStart?: string;
  workdayEnd?: string;
};

type AvailabilitySlot = {
  start: string;
  end: string;
  durationMinutes: number;
};

type BusyInterval = {
  startMs: number;
  endMs: number;
};

function parseCliArgs(argv: string[]): ParsedCli {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      next: { type: "boolean" },
      limit: { type: "string", short: "l", default: "10" },
      timeMin: { type: "string", short: "t" },
      timeMax: { type: "string", short: "m" },
      calendar: { type: "string", short: "c", default: "primary" },
      summary: { type: "string" },
      description: { type: "string", short: "d" },
      start: { type: "string" },
      end: { type: "string" },
      location: { type: "string" },
      attendees: { type: "string" },
      query: { type: "string", short: "q" },
      from: { type: "string" },
      to: { type: "string" },
      duration: { type: "string" },
      "workday-start": { type: "string" },
      "workday-end": { type: "string" },
      attendee: { type: "string" },
    },
  });

  const [command, ...args] = positionals;
  return {
    command,
    args,
    values: values as CliValues,
  };
}

function ensureToken(token: string | undefined, helpRequested: boolean): string {
  if (!token && !helpRequested) {
    throw new Error("GOOGLE_CALENDAR_ACCESS_TOKEN environment variable required");
  }
  return token ?? "";
}

function getHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

function parsePositiveInt(value: string | undefined, label: string): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: expected a positive integer.`);
  }
  return parsed;
}

function normalizeDateInput(value: string, boundary: "start" | "end"): string {
  if (DATE_ONLY_RE.test(value)) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid datetime: ${value}`);
    }
    if (boundary === "end") {
      date.setDate(date.getDate() + 1);
    }
    return date.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  return parsed.toISOString();
}

function normalizeEventDateTime(value: string): string {
  if (DATE_ONLY_RE.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  return parsed.toISOString();
}

function normalizeEventBoundary(value: string): string {
  if (DATE_ONLY_RE.test(value)) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid datetime: ${value}`);
    }
    return date.toISOString();
  }

  return normalizeEventDateTime(value);
}

function parseDurationMinutes(value: string | undefined): number {
  if (!value) {
    return 30;
  }

  const trimmed = value.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    const minutes = Number.parseInt(trimmed, 10);
    if (minutes > 0) {
      return minutes;
    }
  }

  const match = trimmed.match(/^(\d+)(m|h)$/);
  if (!match) {
    throw new Error("Invalid --duration: use minutes like 30 or 30m, or hours like 1h.");
  }

  const amount = Number.parseInt(match[1] || "", 10);
  if (amount <= 0) {
    throw new Error("Invalid --duration: duration must be greater than 0.");
  }

  return match[2] === "h" ? amount * 60 : amount;
}

function parseWorkdayTime(
  value: string | undefined,
  flag: string,
): { hours: number; minutes: number } {
  if (!value) {
    throw new Error(`Missing ${flag}.`);
  }

  const match = value.match(WORKDAY_TIME_RE);
  if (!match) {
    throw new Error(`Invalid ${flag}: expected HH:MM in 24-hour time.`);
  }

  return {
    hours: Number.parseInt(match[1] || "", 10),
    minutes: Number.parseInt(match[2] || "", 10),
  };
}

function toEventOutput(event: CalendarEvent) {
  return {
    id: event.id,
    summary: event.summary || "(No title)",
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    location: event.location,
    status: event.status,
  };
}

function toSearchOutput(event: CalendarEvent) {
  return {
    ...toEventOutput(event),
    attendees:
      event.attendees?.map((attendee) => ({
        email: attendee.email,
        responseStatus: attendee.responseStatus,
      })) ?? [],
  };
}

function eventMatchesQuery(event: CalendarEvent, query: string | undefined): boolean {
  if (!query) {
    return true;
  }

  const haystack = [event.summary, event.description, event.location]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  return haystack.includes(query.trim().toLowerCase());
}

function eventMatchesAttendee(event: CalendarEvent, attendeeEmail: string | undefined): boolean {
  if (!attendeeEmail) {
    return true;
  }

  const wanted = attendeeEmail.trim().toLowerCase();
  return (
    event.attendees?.some((attendee) => attendee.email?.trim().toLowerCase() === wanted) ?? false
  );
}

export function filterSearchEvents(
  events: CalendarEvent[],
  criteria: { query?: string; attendee?: string; next?: boolean; limit: number },
): CalendarEvent[] {
  const filtered = events.filter(
    (event) =>
      eventMatchesQuery(event, criteria.query) && eventMatchesAttendee(event, criteria.attendee),
  );

  if (criteria.next) {
    return filtered.slice(0, 1);
  }

  return filtered.slice(0, criteria.limit);
}

function calendarEventToBusyInterval(event: CalendarEvent): BusyInterval | null {
  const startValue = event.start?.dateTime || event.start?.date;
  const endValue = event.end?.dateTime || event.end?.date;
  if (!startValue || !endValue || event.status === "cancelled") {
    return null;
  }

  const startMs = new Date(normalizeEventBoundary(startValue)).getTime();
  const endMs = new Date(normalizeEventBoundary(endValue)).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  return { startMs, endMs };
}

function mergeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
  const sorted = intervals.toSorted((a, b) => a.startMs - b.startMs);
  const merged: BusyInterval[] = [];

  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.startMs > last.endMs) {
      merged.push({ ...interval });
      continue;
    }

    last.endMs = Math.max(last.endMs, interval.endMs);
  }

  return merged;
}

function pushSlotsForWindow(
  mergedBusy: BusyInterval[],
  windowStartMs: number,
  windowEndMs: number,
  durationMs: number,
  slots: AvailabilitySlot[],
) {
  let cursorMs = windowStartMs;

  for (const busy of mergedBusy) {
    if (busy.endMs <= windowStartMs) {
      continue;
    }
    if (busy.startMs >= windowEndMs) {
      break;
    }

    const busyStartMs = Math.max(busy.startMs, windowStartMs);
    const busyEndMs = Math.min(busy.endMs, windowEndMs);

    if (busyStartMs - cursorMs >= durationMs) {
      slots.push({
        start: new Date(cursorMs).toISOString(),
        end: new Date(busyStartMs).toISOString(),
        durationMinutes: Math.round((busyStartMs - cursorMs) / 60_000),
      });
    }

    cursorMs = Math.max(cursorMs, busyEndMs);
  }

  if (windowEndMs - cursorMs >= durationMs) {
    slots.push({
      start: new Date(cursorMs).toISOString(),
      end: new Date(windowEndMs).toISOString(),
      durationMinutes: Math.round((windowEndMs - cursorMs) / 60_000),
    });
  }
}

export function calculateAvailabilitySlots(
  events: CalendarEvent[],
  request: AvailabilityRequest,
): AvailabilitySlot[] {
  const fromMs = new Date(normalizeDateInput(request.from, "start")).getTime();
  const toMs = new Date(normalizeDateInput(request.to, "end")).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    throw new Error("Invalid availability window: --to must be after --from.");
  }

  const durationMs = request.durationMinutes * 60_000;
  if (durationMs <= 0) {
    throw new Error("Availability duration must be greater than 0.");
  }

  const mergedBusy = mergeBusyIntervals(
    events
      .map(calendarEventToBusyInterval)
      .filter((interval): interval is BusyInterval => interval !== null)
      .map((interval) => ({
        startMs: Math.max(interval.startMs, fromMs),
        endMs: Math.min(interval.endMs, toMs),
      }))
      .filter((interval) => interval.endMs > interval.startMs),
  );

  const slots: AvailabilitySlot[] = [];
  const hasWorkday = request.workdayStart || request.workdayEnd;
  if (!hasWorkday) {
    pushSlotsForWindow(mergedBusy, fromMs, toMs, durationMs, slots);
    return slots.slice(0, request.limit);
  }

  const workdayStart = parseWorkdayTime(request.workdayStart, "--workday-start");
  const workdayEnd = parseWorkdayTime(request.workdayEnd, "--workday-end");
  const dayStartMinutes = workdayStart.hours * 60 + workdayStart.minutes;
  const dayEndMinutes = workdayEnd.hours * 60 + workdayEnd.minutes;
  if (dayEndMinutes <= dayStartMinutes) {
    throw new Error("--workday-end must be after --workday-start.");
  }

  const dayCursor = new Date(fromMs);
  dayCursor.setHours(0, 0, 0, 0);

  while (dayCursor.getTime() < toMs && slots.length < request.limit) {
    const windowStart = new Date(dayCursor);
    windowStart.setHours(workdayStart.hours, workdayStart.minutes, 0, 0);

    const windowEnd = new Date(dayCursor);
    windowEnd.setHours(workdayEnd.hours, workdayEnd.minutes, 0, 0);

    const effectiveStartMs = Math.max(fromMs, windowStart.getTime());
    const effectiveEndMs = Math.min(toMs, windowEnd.getTime());

    if (effectiveEndMs - effectiveStartMs >= durationMs) {
      pushSlotsForWindow(mergedBusy, effectiveStartMs, effectiveEndMs, durationMs, slots);
    }

    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  return slots.slice(0, request.limit);
}

async function fetchEvents(
  token: string,
  calendar: string,
  params: URLSearchParams,
): Promise<CalendarEvent[]> {
  const calendarId = encodeURIComponent(calendar);
  const res = await fetch(`${BASE_URL}/calendars/${calendarId}/events?${params.toString()}`, {
    headers: getHeaders(token),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }

  const { items = [] } = (await res.json()) as { items?: CalendarEvent[] };
  return items;
}

async function fetchEventDetails(
  token: string,
  calendar: string,
  eventId: string,
): Promise<CalendarEvent> {
  const calendarId = encodeURIComponent(calendar);
  const res = await fetch(`${BASE_URL}/calendars/${calendarId}/events/${eventId}`, {
    headers: getHeaders(token),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }

  return (await res.json()) as CalendarEvent;
}

async function hydrateEventsForAttendeeSearch(
  token: string,
  calendar: string,
  events: CalendarEvent[],
): Promise<CalendarEvent[]> {
  return Promise.all(
    events.map(async (event) => {
      if (event.attendees) {
        return event;
      }
      return fetchEventDetails(token, calendar, event.id);
    }),
  );
}

function buildEventListParams(
  values: CliValues,
  options?: { defaultTimeMinNow?: boolean; query?: string; fetchLimit?: number },
) {
  const params = new URLSearchParams({
    maxResults: String(options?.fetchLimit ?? parsePositiveInt(values.limit, "--limit")),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const timeMin = values.timeMin
    ? normalizeDateInput(values.timeMin, "start")
    : options?.defaultTimeMinNow
      ? new Date().toISOString()
      : undefined;
  const timeMax = values.timeMax ? normalizeDateInput(values.timeMax, "end") : undefined;

  if (timeMin) {
    params.set("timeMin", timeMin);
  }
  if (timeMax) {
    params.set("timeMax", timeMax);
  }
  if (timeMin && timeMax && new Date(timeMax).getTime() <= new Date(timeMin).getTime()) {
    throw new Error("--timeMax must be after --timeMin.");
  }
  if (options?.query) {
    params.set("q", options.query);
  }

  return params;
}

async function listEvents(token: string, values: CliValues) {
  const events = await fetchEvents(
    token,
    values.calendar || "primary",
    buildEventListParams(values, { defaultTimeMinNow: true }),
  );
  console.log(JSON.stringify(events.map(toEventOutput), null, 2));
}

async function searchEvents(token: string, values: CliValues) {
  if (!values.query && !values.attendee) {
    throw new Error("Required: google-calendar search --query <text> or --attendee <email>");
  }

  const limit = parsePositiveInt(values.limit, "--limit");
  const calendar = values.calendar || "primary";
  const events = await fetchEvents(
    token,
    calendar,
    buildEventListParams(values, {
      query: values.attendee ? undefined : values.query,
      defaultTimeMinNow: values.next || Boolean(values.attendee),
      fetchLimit: values.attendee ? Math.max(limit * 20, 100) : limit,
    }),
  );
  const hydratedEvents = values.attendee
    ? await hydrateEventsForAttendeeSearch(token, calendar, events)
    : events;
  const results = filterSearchEvents(hydratedEvents, {
    query: values.query,
    attendee: values.attendee,
    next: values.next,
    limit,
  });
  console.log(JSON.stringify(results.map(toSearchOutput), null, 2));
}

async function getEvent(token: string, eventId: string | undefined, calendar = "primary") {
  if (!eventId) {
    throw new Error("Required: google-calendar get <eventId>");
  }

  const calendarId = encodeURIComponent(calendar);
  const res = await fetch(`${BASE_URL}/calendars/${calendarId}/events/${eventId}`, {
    headers: getHeaders(token),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }

  const event = (await res.json()) as CalendarEvent;
  console.log(
    JSON.stringify(
      {
        id: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location,
        status: event.status,
        attendees: event.attendees?.map((a) => ({
          email: a.email,
          responseStatus: a.responseStatus,
        })),
        htmlLink: event.htmlLink,
        creator: event.creator,
        organizer: event.organizer,
      },
      null,
      2,
    ),
  );
}

async function createEvent(token: string, values: CliValues) {
  if (!values.summary || !values.start || !values.end) {
    throw new Error("Required: --summary <title> --start <datetime> --end <datetime>");
  }

  const isAllDay = !values.start.includes("T");
  const event: {
    summary: string;
    description?: string;
    location?: string;
    start?: { date?: string; dateTime?: string; timeZone?: string };
    end?: { date?: string; dateTime?: string; timeZone?: string };
    attendees?: Array<{ email: string }>;
  } = {
    summary: values.summary,
    description: values.description,
    location: values.location,
  };

  if (isAllDay) {
    event.start = { date: values.start };
    event.end = { date: values.end };
  } else {
    event.start = {
      dateTime: normalizeEventDateTime(values.start),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    event.end = {
      dateTime: normalizeEventDateTime(values.end),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  if (values.attendees) {
    event.attendees = values.attendees.split(",").map((email) => ({ email: email.trim() }));
  }

  const calendarId = encodeURIComponent(values.calendar || "primary");
  const res = await fetch(`${BASE_URL}/calendars/${calendarId}/events`, {
    method: "POST",
    headers: { ...getHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
  const created = (await res.json()) as { htmlLink?: string };
  console.log(`Event created: ${created.htmlLink}`);
}

async function updateEvent(token: string, eventId: string | undefined, values: CliValues) {
  if (!eventId) {
    throw new Error("Required: google-calendar update <eventId>");
  }

  const calendarId = encodeURIComponent(values.calendar || "primary");
  const getRes = await fetch(`${BASE_URL}/calendars/${calendarId}/events/${eventId}`, {
    headers: getHeaders(token),
  });
  if (!getRes.ok) {
    throw new Error(await getRes.text());
  }
  const existing = (await getRes.json()) as CalendarEvent;

  if (values.summary) {
    existing.summary = values.summary;
  }
  if (values.description) {
    existing.description = values.description;
  }
  if (values.location) {
    existing.location = values.location;
  }
  if (values.start) {
    existing.start = !values.start.includes("T")
      ? { date: values.start }
      : {
          dateTime: normalizeEventDateTime(values.start),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
  }
  if (values.end) {
    existing.end = !values.end.includes("T")
      ? { date: values.end }
      : {
          dateTime: normalizeEventDateTime(values.end),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
  }

  const res = await fetch(`${BASE_URL}/calendars/${calendarId}/events/${eventId}`, {
    method: "PUT",
    headers: { ...getHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(existing),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
  console.log(`Event updated: ${eventId}`);
}

async function deleteEvent(token: string, eventId: string | undefined, calendar = "primary") {
  if (!eventId) {
    throw new Error("Required: google-calendar delete <eventId>");
  }

  const calendarId = encodeURIComponent(calendar);
  const res = await fetch(`${BASE_URL}/calendars/${calendarId}/events/${eventId}`, {
    method: "DELETE",
    headers: getHeaders(token),
  });

  if (!res.ok && res.status !== 204) {
    throw new Error(await res.text());
  }
  console.log(`Event deleted: ${eventId}`);
}

async function listCalendars(token: string) {
  const res = await fetch(`${BASE_URL}/users/me/calendarList`, { headers: getHeaders(token) });
  if (!res.ok) {
    throw new Error(await res.text());
  }

  const { items = [] } = (await res.json()) as {
    items?: Array<{
      id: string;
      summary: string;
      description?: string;
      primary?: boolean;
      accessRole?: string;
    }>;
  };
  const calendars = items.map((cal) => ({
    id: cal.id,
    summary: cal.summary,
    description: cal.description,
    primary: cal.primary || false,
    accessRole: cal.accessRole,
  }));

  console.log(JSON.stringify(calendars, null, 2));
}

async function todayEvents(token: string, values: CliValues) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const params = new URLSearchParams({
    maxResults: "50",
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
  });

  const events = await fetchEvents(token, values.calendar || "primary", params);
  console.log(JSON.stringify(events.map(toEventOutput), null, 2));
}

async function availability(token: string, values: CliValues) {
  if (!values.from || !values.to) {
    throw new Error(
      "Required: google-calendar availability --from <datetime> --to <datetime> [--duration 30m]",
    );
  }

  const request: AvailabilityRequest = {
    from: values.from,
    to: values.to,
    durationMinutes: parseDurationMinutes(values.duration),
    limit: parsePositiveInt(values.limit, "--limit"),
    workdayStart: values["workday-start"],
    workdayEnd: values["workday-end"],
  };

  const params = new URLSearchParams({
    maxResults: "2500",
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: normalizeDateInput(values.from, "start"),
    timeMax: normalizeDateInput(values.to, "end"),
  });

  const events = await fetchEvents(token, values.calendar || "primary", params);
  const slots = calculateAvailabilitySlots(events, request);

  console.log(
    JSON.stringify(
      {
        from: normalizeDateInput(values.from, "start"),
        to: normalizeDateInput(values.to, "end"),
        durationMinutes: request.durationMinutes,
        nextAvailable: slots[0] ?? null,
        slots,
      },
      null,
      2,
    ),
  );
}

function showHelp() {
  console.log(`Google Calendar CLI - Commands:
  list [-l limit] [-t timeMin] [-m timeMax] [-c calendar]    List events
  search [-q <text>] [--attendee <email>] [--next] [-l limit] [-t timeMin] [-m timeMax] [-c calendar]
                                                              Search for matching events or the next event with an attendee
  availability --from <datetime> --to <datetime> [--duration 30m] [--workday-start HH:MM] [--workday-end HH:MM] [-l limit] [-c calendar]
                                                              Return free slots in a time range
  get <eventId> [-c calendar]                                 Get event details
  create --summary <title> --start <datetime> --end <datetime> [--description] [--location] [--attendees email1,email2]
  update <eventId> [--summary] [--start] [--end] [--description] [--location]
  delete <eventId> [-c calendar]                              Delete an event
  calendars                                                   List available calendars
  today [-c calendar]                                         List today's events

Datetime format:
  2024-01-15T09:00:00
  2024-01-15T09:00:00Z
  2024-01-15

Notes:
  Timed range filters are normalized to RFC3339 automatically.
  Date-only --from/--to values use local midnight boundaries.

Options:
  -h, --help                                                  Show this help message`);
}

export async function main(argv = process.argv.slice(2), env = process.env): Promise<void> {
  const parsed = parseCliArgs(argv);
  if (parsed.values.help) {
    showHelp();
    return;
  }

  const token = ensureToken(env.GOOGLE_CALENDAR_ACCESS_TOKEN, Boolean(parsed.values.help));

  switch (parsed.command) {
    case "list":
      await listEvents(token, parsed.values);
      return;
    case "search":
      await searchEvents(token, parsed.values);
      return;
    case "availability":
      await availability(token, parsed.values);
      return;
    case "get":
      await getEvent(token, parsed.args[0], parsed.values.calendar || "primary");
      return;
    case "create":
      await createEvent(token, parsed.values);
      return;
    case "update":
      await updateEvent(token, parsed.args[0], parsed.values);
      return;
    case "delete":
      await deleteEvent(token, parsed.args[0], parsed.values.calendar || "primary");
      return;
    case "calendars":
      await listCalendars(token);
      return;
    case "today":
      await todayEvents(token, parsed.values);
      return;
    default:
      showHelp();
  }
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
