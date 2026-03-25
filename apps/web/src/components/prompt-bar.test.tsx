// @vitest-environment jsdom

import type React from "react";
import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatDraftStore } from "@/components/chat/chat-draft-store";
import { PromptBar } from "./prompt-bar";

void jestDomVitest;

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <span data-next-image={props.alt ?? ""} />
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("PromptBar", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
    useChatDraftStore.setState({ drafts: {}, hasHydrated: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("clears the composer after a successful async submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);

    render(<PromptBar onSubmit={onSubmit} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Queue this follow-up" } });
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("Queue this follow-up", undefined);
    });
    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });

  it("keeps the composer text when submit returns false", async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);

    render(<PromptBar onSubmit={onSubmit} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Keep this draft" } });
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("Keep this draft", undefined);
    });
    expect(input).toHaveValue("Keep this draft");
  });
});
