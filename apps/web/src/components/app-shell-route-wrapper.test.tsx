// @vitest-environment jsdom

import type React from "react";
import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShellRouteWrapper } from "./app-shell-route-wrapper";

void jestDomVitest;

type MockCurrentUserState = {
  data: { onboardedAt: Date | null } | undefined;
  isLoading: boolean;
  isFetching: boolean;
};

const mocks = vi.hoisted(() => ({
  pathname: "/chat",
  replace: vi.fn(),
  currentUser: {
    data: { onboardedAt: null },
    isLoading: false,
    isFetching: false,
  } as MockCurrentUserState,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/orpc/hooks", () => ({
  useCurrentUser: () => mocks.currentUser,
}));

describe("AppShellRouteWrapper", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/chat";
    mocks.currentUser = {
      data: { onboardedAt: null },
      isLoading: false,
      isFetching: false,
    };
  });

  it("waits for a refetch before redirecting an incomplete user", async () => {
    mocks.currentUser = {
      data: { onboardedAt: null },
      isLoading: false,
      isFetching: true,
    };

    const { rerender } = render(
      <AppShellRouteWrapper initialHasSession>
        <div>child</div>
      </AppShellRouteWrapper>,
    );

    expect(mocks.replace).not.toHaveBeenCalled();

    mocks.currentUser = {
      data: { onboardedAt: new Date("2026-03-16T12:00:00.000Z") },
      isLoading: false,
      isFetching: false,
    };

    rerender(
      <AppShellRouteWrapper initialHasSession>
        <div>child</div>
      </AppShellRouteWrapper>,
    );

    await waitFor(() => {
      expect(mocks.replace).not.toHaveBeenCalled();
    });
  });

  it("redirects once the incomplete user state is confirmed", async () => {
    render(
      <AppShellRouteWrapper initialHasSession>
        <div>child</div>
      </AppShellRouteWrapper>,
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/onboarding/subscriptions");
    });
  });
});
