// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { deleteConversationMock } = vi.hoisted(() => ({
  deleteConversationMock: vi.fn(),
}));

vi.mock("@/lib/generation-stream", () => ({
  runGenerationStream: vi.fn(),
}));

vi.mock("./client", () => ({
  client: {
    conversation: {
      delete: deleteConversationMock,
    },
  },
}));

import { useDeleteConversation } from "./hooks";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function DeleteConversationHarness({ id }: { id: string }) {
  const deleteConversation = useDeleteConversation();
  const handleDelete = React.useCallback(() => {
    deleteConversation.mutate(id);
  }, [deleteConversation, id]);

  return (
    <button type="button" onClick={handleDelete}>
      Delete
    </button>
  );
}

describe("useDeleteConversation", () => {
  beforeEach(() => {
    deleteConversationMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("removes deleted conversations from cached lists immediately", async () => {
    const queryClient = new QueryClient();
    const deleteDeferred = createDeferred<{ success: boolean }>();

    deleteConversationMock.mockReturnValueOnce(deleteDeferred.promise);

    queryClient.setQueryData(["conversation", "list", 50], {
      conversations: [{ id: "keep" }, { id: "delete-me" }],
    });
    queryClient.setQueryData(["conversation", "list", 10], {
      conversations: [{ id: "delete-me" }],
    });
    queryClient.setQueryData(["conversation", "get", "delete-me"], {
      id: "delete-me",
      title: "Delete me",
    });
    queryClient.setQueryData(["conversation", "usage", "delete-me"], {
      totalTokens: 42,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DeleteConversationHarness id="delete-me" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteConversationMock).toHaveBeenCalledWith({ id: "delete-me" });
      expect(queryClient.getQueryData(["conversation", "list", 50])).toEqual({
        conversations: [{ id: "keep" }],
      });
      expect(queryClient.getQueryData(["conversation", "list", 10])).toEqual({
        conversations: [],
      });
      expect(queryClient.getQueryData(["conversation", "get", "delete-me"])).toBeUndefined();
      expect(queryClient.getQueryData(["conversation", "usage", "delete-me"])).toBeUndefined();
    });

    deleteDeferred.resolve({ success: true });

    await waitFor(() => {
      expect(deleteConversationMock).toHaveBeenCalledTimes(1);
    });
  });

  it("restores cached conversations when delete fails", async () => {
    const queryClient = new QueryClient();
    const deleteDeferred = createDeferred<never>();

    deleteConversationMock.mockReturnValueOnce(deleteDeferred.promise);

    queryClient.setQueryData(["conversation", "list", 50], {
      conversations: [{ id: "keep" }, { id: "delete-me" }],
    });
    queryClient.setQueryData(["conversation", "get", "delete-me"], {
      id: "delete-me",
      title: "Delete me",
    });
    queryClient.setQueryData(["conversation", "usage", "delete-me"], {
      totalTokens: 42,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DeleteConversationHarness id="delete-me" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(queryClient.getQueryData(["conversation", "list", 50])).toEqual({
        conversations: [{ id: "keep" }],
      });
      expect(queryClient.getQueryData(["conversation", "get", "delete-me"])).toBeUndefined();
      expect(queryClient.getQueryData(["conversation", "usage", "delete-me"])).toBeUndefined();
    });

    deleteDeferred.reject(new Error("delete failed"));

    await waitFor(() => {
      expect(queryClient.getQueryData(["conversation", "list", 50])).toEqual({
        conversations: [{ id: "keep" }, { id: "delete-me" }],
      });
      expect(queryClient.getQueryData(["conversation", "get", "delete-me"])).toEqual({
        id: "delete-me",
        title: "Delete me",
      });
      expect(queryClient.getQueryData(["conversation", "usage", "delete-me"])).toEqual({
        totalTokens: 42,
      });
    });
  });
});
