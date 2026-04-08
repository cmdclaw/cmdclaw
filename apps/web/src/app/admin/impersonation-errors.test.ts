import { describe, expect, it } from "vitest";
import { INVITE_ONLY_LOGIN_ERROR } from "@/lib/admin-emails";
import {
  getImpersonationErrorMessage,
  INVITE_ONLY_IMPERSONATION_ERROR_MESSAGE,
} from "./impersonation-errors";

describe("getImpersonationErrorMessage", () => {
  it("maps invite-only impersonation failures to actionable copy", () => {
    expect(
      getImpersonationErrorMessage({
        message: INVITE_ONLY_LOGIN_ERROR,
      }),
    ).toBe(INVITE_ONLY_IMPERSONATION_ERROR_MESSAGE);

    expect(
      getImpersonationErrorMessage({
        code: INVITE_ONLY_LOGIN_ERROR,
        message: "Forbidden",
      }),
    ).toBe(INVITE_ONLY_IMPERSONATION_ERROR_MESSAGE);
  });

  it("returns the upstream message for other impersonation errors", () => {
    expect(
      getImpersonationErrorMessage({
        message: "You do not have permission to impersonate this user.",
      }),
    ).toBe("You do not have permission to impersonate this user.");
  });

  it("falls back to the generic impersonation message when the error is empty", () => {
    expect(getImpersonationErrorMessage(null)).toBe("Unable to impersonate.");
    expect(getImpersonationErrorMessage({ message: "   " })).toBe("Unable to impersonate.");
  });
});
