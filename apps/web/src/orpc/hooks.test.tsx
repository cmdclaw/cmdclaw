// @vitest-environment jsdom

import {
  GENERATION_ERROR_PHASES,
  START_GENERATION_ERROR_CODES,
} from "@cmdclaw/core/lib/generation-errors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const { runGenerationStreamMock, invalidateQueriesMock } = vi.hoisted(() => ({
  runGenerationStreamMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
}));

vi.mock("@/lib/generation-stream", () => ({
  runGenerationStream: runGenerationStreamMock,
}));

vi.mock("./client", () => ({
  client: {},
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: invalidateQueriesMock,
    }),
  };
});

import { useGeneration } from "./hooks";

function HookHarness() {
  const { startGeneration } = useGeneration();
  const [message, setMessage] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<string | null>(null);
  const [code, setCode] = React.useState<string | null>(null);
  const handleStart = React.useCallback(() => {
    void startGeneration(
      {
        content: "hello",
        model: "openai/gpt-5.4-mini",
      },
      {
        onError: (error) => {
          setMessage(error.message);
          setPhase(error.phase);
          setCode(error.code);
        },
      },
    );
  }, [startGeneration]);

  return (
    <div>
      <button type="button" onClick={handleStart}>
        Start
      </button>
      <div data-testid="message">{message}</div>
      <div data-testid="phase">{phase}</div>
      <div data-testid="code">{code}</div>
    </div>
  );
}

describe("useGeneration", () => {
  beforeEach(() => {
    runGenerationStreamMock.mockReset();
    invalidateQueriesMock.mockReset();
  });

  it("normalizes pre-start RPC failures before onStarted", async () => {
    runGenerationStreamMock.mockRejectedValueOnce({
      code: "BAD_REQUEST",
      message:
        "Selected ChatGPT model is not available for your current connection. Choose another model and retry.",
      data: {
        generationErrorCode: START_GENERATION_ERROR_CODES.MODEL_ACCESS_DENIED,
        phase: GENERATION_ERROR_PHASES.START_RPC,
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <HookHarness />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => {
      expect(screen.getByTestId("message")).toHaveTextContent(
        "Selected ChatGPT model is not available for your current connection. Choose another model and retry.",
      );
      expect(screen.getByTestId("phase")).toHaveTextContent(GENERATION_ERROR_PHASES.START_RPC);
      expect(screen.getByTestId("code")).toHaveTextContent(
        START_GENERATION_ERROR_CODES.MODEL_ACCESS_DENIED,
      );
    });
  });
});
