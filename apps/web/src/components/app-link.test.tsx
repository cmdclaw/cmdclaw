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
import { afterEach, describe, expect, it } from "vitest";
import { AppLink } from "./app-link";

void jestDomVitest;

describe("AppLink", () => {
  afterEach(() => {
    cleanup();
  });

  it("navigates internal hrefs through TanStack Router", async () => {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <AppLink href="/agents">Agents</AppLink>,
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

    fireEvent.click(await screen.findByRole("link", { name: "Agents" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/agents");
    });
  });
});
