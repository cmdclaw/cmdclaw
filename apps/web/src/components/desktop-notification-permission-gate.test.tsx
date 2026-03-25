// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useCurrentUserMock } = vi.hoisted(() => ({
  useCurrentUserMock: vi.fn(),
}));

vi.mock("@/orpc/hooks", () => ({
  useCurrentUser: useCurrentUserMock,
}));

vi.mock("@/lib/browser-push", () => ({
  setupBrowserPushNotifications: vi.fn(),
}));

import { DesktopNotificationPermissionGate } from "./desktop-notification-permission-gate";

describe("DesktopNotificationPermissionGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCurrentUserMock.mockReturnValue({ data: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("does not enable the current-user query when disabled", () => {
    render(<DesktopNotificationPermissionGate enabled={false} />);

    expect(useCurrentUserMock).toHaveBeenCalledWith({ enabled: false });
  });
});
