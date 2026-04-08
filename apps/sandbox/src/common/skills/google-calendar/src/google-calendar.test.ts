import { describe, expect, test } from "vitest";
import { runSkillCli } from "../../_test-utils/run-skill-cli";
import { calculateAvailabilitySlots, filterSearchEvents } from "./google-calendar-lib";

describe("google-calendar CLI", () => {
  test("prints help text when auth env is missing", () => {
    const result = runSkillCli(
      "src/common/skills/google-calendar/src/google-calendar.ts",
      ["--help"],
      {
        GOOGLE_CALENDAR_ACCESS_TOKEN: "",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Commands");
  });

  test("prints help text when auth env is provided", () => {
    const result = runSkillCli(
      "src/common/skills/google-calendar/src/google-calendar.ts",
      ["--help"],
      {
        GOOGLE_CALENDAR_ACCESS_TOKEN: "test-token",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Google Calendar CLI - Commands");
    expect(result.stdout).toContain("search [-q <text>]");
    expect(result.stdout).toContain("availability --from <datetime> --to <datetime>");
    expect(result.stdout).toContain("--attendee <email>");
    expect(result.stdout).toContain("--next");
  });

  test("filters matching events by attendee email and returns the next result", () => {
    const results = filterSearchEvents(
      [
        {
          id: "event-1",
          summary: "Weekly Sprint Review",
          attendees: [{ email: "samuel@example.com", responseStatus: "accepted" }],
          start: { dateTime: "2026-03-18T11:00:00Z" },
          end: { dateTime: "2026-03-18T12:00:00Z" },
        },
        {
          id: "event-2",
          summary: "Retro",
          attendees: [{ email: "other@example.com", responseStatus: "accepted" }],
          start: { dateTime: "2026-03-18T13:00:00Z" },
          end: { dateTime: "2026-03-18T14:00:00Z" },
        },
      ],
      {
        attendee: "samuel@example.com",
        next: true,
        limit: 10,
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("event-1");
  });

  test("filters matching events by text and attendee together", () => {
    const results = filterSearchEvents(
      [
        {
          id: "event-1",
          summary: "Weekly Sprint Review",
          attendees: [{ email: "samuel@example.com", responseStatus: "accepted" }],
          start: { dateTime: "2026-03-18T11:00:00Z" },
          end: { dateTime: "2026-03-18T12:00:00Z" },
        },
        {
          id: "event-2",
          summary: "Weekly Planning",
          attendees: [{ email: "samuel@example.com", responseStatus: "accepted" }],
          start: { dateTime: "2026-03-18T13:00:00Z" },
          end: { dateTime: "2026-03-18T14:00:00Z" },
        },
      ],
      {
        query: "review",
        attendee: "samuel@example.com",
        limit: 10,
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("event-1");
  });

  test("calculates the next availability gap from busy events", () => {
    const slots = calculateAvailabilitySlots(
      [
        {
          id: "event-1",
          summary: "Morning block",
          start: { dateTime: "2026-03-18T08:00:00Z" },
          end: { dateTime: "2026-03-18T10:00:00Z" },
        },
        {
          id: "event-2",
          summary: "Follow-up",
          start: { dateTime: "2026-03-18T10:00:00Z" },
          end: { dateTime: "2026-03-18T10:30:00Z" },
        },
        {
          id: "event-3",
          summary: "Review",
          start: { dateTime: "2026-03-18T11:00:00Z" },
          end: { dateTime: "2026-03-18T12:00:00Z" },
        },
      ],
      {
        from: "2026-03-18T08:00:00Z",
        to: "2026-03-18T13:00:00Z",
        durationMinutes: 30,
        limit: 10,
      },
    );

    expect(slots[0]).toEqual({
      start: "2026-03-18T10:30:00.000Z",
      end: "2026-03-18T11:00:00.000Z",
      durationMinutes: 30,
    });
  });

  test("respects workday bounds when computing availability", () => {
    const slots = calculateAvailabilitySlots(
      [
        {
          id: "event-1",
          summary: "Standup",
          start: { dateTime: "2026-03-18T08:00:00Z" },
          end: { dateTime: "2026-03-18T09:15:00Z" },
        },
      ],
      {
        from: "2026-03-18T00:00:00Z",
        to: "2026-03-19T00:00:00Z",
        durationMinutes: 30,
        limit: 10,
        workdayStart: "09:00",
        workdayEnd: "18:00",
      },
    );

    expect(slots[0]).toEqual({
      start: "2026-03-18T09:15:00.000Z",
      end: "2026-03-18T18:00:00.000Z",
      durationMinutes: 525,
    });
  });

  test("treats all-day event end dates as exclusive", () => {
    const slots = calculateAvailabilitySlots(
      [
        {
          id: "off-1",
          summary: "Off",
          start: { date: "2026-03-16" },
          end: { date: "2026-03-17" },
        },
        {
          id: "off-2",
          summary: "Off",
          start: { date: "2026-03-17" },
          end: { date: "2026-03-18" },
        },
        {
          id: "event-1",
          summary: "Block",
          start: { dateTime: "2026-03-18T08:00:00Z" },
          end: { dateTime: "2026-03-18T10:30:00Z" },
        },
        {
          id: "event-2",
          summary: "Review",
          start: { dateTime: "2026-03-18T11:00:00Z" },
          end: { dateTime: "2026-03-18T12:00:00Z" },
        },
      ],
      {
        from: "2026-03-16T00:00:00Z",
        to: "2026-03-19T00:00:00Z",
        durationMinutes: 30,
        limit: 10,
        workdayStart: "09:00",
        workdayEnd: "18:00",
      },
    );

    expect(slots[0]).toEqual({
      start: "2026-03-18T10:30:00.000Z",
      end: "2026-03-18T11:00:00.000Z",
      durationMinutes: 30,
    });
  });
});
