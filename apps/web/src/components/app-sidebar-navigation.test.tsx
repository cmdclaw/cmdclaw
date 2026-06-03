// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";

void jestDomVitest;

type VitestProcedure = Extract<
  NonNullable<Parameters<typeof vi.fn>[0]>,
  (...args: never[]) => unknown
>;

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<VitestProcedure>(),
}));

vi.mock("@/components/app-image", () => ({
  AppImage: ({
    alt,
    src,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string }) => (
    // oxlint-disable-next-line nextjs/no-img-element
    <img alt={alt} src={src} {...props} />
  ),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    getSession: mocks.getSession,
    signOut: vi.fn<VitestProcedure>(),
    admin: {
      stopImpersonating: vi.fn<VitestProcedure>(),
    },
  },
}));

vi.mock("@/lib/edition", () => ({
  clientEditionCapabilities: {
    hasBilling: true,
    hasInstanceAdmin: true,
    hasSupportAdmin: true,
  },
}));

function installLocalStorageStub() {
  const store = new Map<string, string>();

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
}

function mockAdminSession() {
  mocks.getSession.mockResolvedValue({
    data: {
      session: {},
      user: {
        email: "admin@example.com",
        role: "admin",
      },
    },
  });
}

function renderWithRouter() {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <AppSidebar />,
  });
  const agentsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/agents",
    component: () => <div>Agents page</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, agentsRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  render(<RouterProvider router={router} />);

  return router;
}

describe("AppSidebar navigation", () => {
  beforeEach(() => {
    installLocalStorageStub();
    window.localStorage.clear();
    mocks.getSession.mockReset();
    mockAdminSession();
  });

  afterEach(() => {
    cleanup();
  });

  it("navigates when a sidebar link is clicked", async () => {
    const router = renderWithRouter();

    fireEvent.click(await screen.findByRole("link", { name: "Agents" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/agents");
    });
  });
});
