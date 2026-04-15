// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillingPage from "./page";

type MockFn = (...args: unknown[]) => unknown;

const mocks = vi.hoisted(() => ({
  replace: vi.fn<MockFn>(),
  useIsAdmin: vi.fn<MockFn>(),
  useBillingOverview: vi.fn<MockFn>(),
  mutateAsync: vi.fn<MockFn>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/hooks/use-is-admin", () => ({
  useIsAdmin: () => mocks.useIsAdmin(),
}));

vi.mock("@/orpc/hooks", () => ({
  useBillingOverview: (enabled?: boolean) => mocks.useBillingOverview(enabled),
  useAttachBillingPlan: () => ({ mutateAsync: mocks.mutateAsync }),
  useOpenBillingPortal: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
  useCancelBillingPlan: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
  useManualBillingTopUp: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));

describe("BillingPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useIsAdmin.mockReturnValue({ isAdmin: false, isLoading: false });
    mocks.useBillingOverview.mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: vi.fn(),
    });
  });

  it("redirects non-admin users back to settings and disables the overview query", async () => {
    render(<BillingPage />);

    expect(mocks.useBillingOverview).toHaveBeenCalledWith(false);

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/settings");
    });
  });
});
