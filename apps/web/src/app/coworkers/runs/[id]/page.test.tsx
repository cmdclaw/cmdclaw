// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CoworkerRunPage from "./page";

void jestDomVitest;

const { mockParams, mockRun } = vi.hoisted(() => ({
  mockParams: { current: { id: "run-1" } as { id: string } },
  mockRun: {
    current: {
      id: "run-1",
      conversationId: "conv-1",
      status: "completed",
      errorMessage: null,
      debugInfo: null,
      events: [],
    } as {
      id: string;
      conversationId: string | null;
      status: string;
      errorMessage: string | null;
      debugInfo: unknown;
      events: Array<{
        id: string;
        type: string;
        payload: unknown;
        createdAt?: Date;
      }>;
    } | null,
  },
}));

vi.mock("next/navigation", () => ({
  useParams: () => mockParams.current,
}));

vi.mock("@/components/chat/chat-area", () => ({
  ChatArea: ({ conversationId }: { conversationId: string }) => <div>Chat {conversationId}</div>,
}));

vi.mock("@/orpc/hooks", () => ({
  useCoworkerRun: () => ({ data: mockRun.current, isLoading: false }),
}));

describe("CoworkerRunPage", () => {
  afterEach(() => {
    cleanup();
    mockParams.current = { id: "run-1" };
    mockRun.current = {
      id: "run-1",
      conversationId: "conv-1",
      status: "completed",
      errorMessage: null,
      debugInfo: null,
      events: [],
    };
  });

  it("shows the remote integration banner when the run used remote integrations", () => {
    mockRun.current = {
      id: "run-1",
      conversationId: "conv-1",
      status: "completed",
      errorMessage: null,
      debugInfo: null,
      events: [
        {
          id: "evt-1",
          type: "remote_integration_source",
          payload: {
            targetEnv: "staging",
            remoteUserId: "remote-user-1",
            remoteUserEmail: "remote@example.com",
          },
        },
      ],
    };

    render(<CoworkerRunPage />);

    expect(screen.getByText("Remote integration source")).toBeInTheDocument();
    expect(screen.getByText("Environment: Staging")).toBeInTheDocument();
    expect(screen.getByText("User: remote@example.com")).toBeInTheDocument();
  });

  it("does not show the banner for local runs", () => {
    render(<CoworkerRunPage />);

    expect(screen.queryByText("Remote integration source")).not.toBeInTheDocument();
  });
});
