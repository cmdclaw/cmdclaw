import { describe, expect, test } from "vitest";
import { formatEmailDate } from "./format-email-date";

describe("formatEmailDate", () => {
  test("converts RFC date into plain local datetime in requested timezone", () => {
    expect(formatEmailDate("Fri, 27 Feb 2026 09:25:52 -0600", "Europe/Dublin")).toBe(
      "2026-02-27 15:25:52",
    );
  });

  test("returns original value when date is invalid", () => {
    expect(formatEmailDate("not-a-date", "Europe/Dublin")).toBe("not-a-date");
  });

  test("returns empty string when header is missing", () => {
    expect(formatEmailDate("", "Europe/Dublin")).toBe("");
  });

  test("returns original header when timezone is missing", () => {
    expect(formatEmailDate("Fri, 27 Feb 2026 09:25:52 -0600")).toBe(
      "Fri, 27 Feb 2026 09:25:52 -0600",
    );
  });

  test("returns original header when timezone is invalid", () => {
    expect(formatEmailDate("Fri, 27 Feb 2026 09:25:52 -0600", "Invalid/Timezone")).toBe(
      "Fri, 27 Feb 2026 09:25:52 -0600",
    );
  });
});
