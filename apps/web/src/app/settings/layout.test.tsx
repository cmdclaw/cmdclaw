// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsLayout from "./layout";

void jestDomVitest;

const mocks = vi.hoisted(() => ({
  pathname: "/settings",
  useIsAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@/hooks/use-is-admin", () => ({
  useIsAdmin: () => mocks.useIsAdmin(),
}));

vi.mock("@/components/ui/tabs", () => ({
  AnimatedTabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AnimatedTab: ({ children, href }: { children: React.ReactNode; href: string; value: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("SettingsLayout", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/settings";
    mocks.useIsAdmin.mockReturnValue({ isAdmin: false, isLoading: false });
  });

  it("hides billing and usage tabs for non-admin users", () => {
    render(
      <SettingsLayout>
        <div>settings content</div>
      </SettingsLayout>,
    );

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Connected AI Account")).toBeInTheDocument();
    expect(screen.queryByText("Usage")).not.toBeInTheDocument();
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();
  });

  it("shows billing and usage tabs for admin users", () => {
    mocks.useIsAdmin.mockReturnValue({ isAdmin: true, isLoading: false });

    render(
      <SettingsLayout>
        <div>settings content</div>
      </SettingsLayout>,
    );

    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });
});
