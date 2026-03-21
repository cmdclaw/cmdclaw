// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

afterEach(() => {
  cleanup();
});

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

import { ModelSelector } from "./model-selector";

const NO_PROVIDER_AUTH = {
  anthropic: { shared: true, user: false },
  openai: { shared: false, user: false },
} as const;
const SHARED_ONLY_AUTH = {
  anthropic: { shared: true, user: false },
  openai: { shared: true, user: false },
} as const;

describe("ModelSelector", () => {
  it("always shows CmdClaw Models with Claude available and GPT-5.4 locked without shared auth", () => {
    const onSelectionChange = vi.fn();

    render(
      <ModelSelector
        selectedModel="anthropic/claude-sonnet-4-6"
        selectedAuthSource="shared"
        providerAvailability={NO_PROVIDER_AUTH}
        onSelectionChange={onSelectionChange}
      />,
    );

    expect(screen.getByText("CmdClaw Models")).toBeInTheDocument();
    expect(
      screen.getByTestId("chat-model-option-cmdclaw-anthropic/claude-sonnet-4-6"),
    ).toBeEnabled();
    expect(screen.getByTestId("chat-model-option-cmdclaw-openai/gpt-5.4")).toBeDisabled();
  });

  it("selects Claude Sonnet 4.6 without a shared auth source", () => {
    const onSelectionChange = vi.fn();

    render(
      <ModelSelector
        selectedModel="openai/gpt-5.4"
        selectedAuthSource="shared"
        providerAvailability={NO_PROVIDER_AUTH}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByTestId("chat-model-option-cmdclaw-anthropic/claude-sonnet-4-6"));

    expect(onSelectionChange).toHaveBeenCalledWith({
      model: "anthropic/claude-sonnet-4-6",
      authSource: "shared",
    });
  });

  it("does not allow selecting shared GPT-5.4 when shared auth is unavailable", () => {
    const onSelectionChange = vi.fn();

    render(
      <ModelSelector
        selectedModel="anthropic/claude-sonnet-4-6"
        selectedAuthSource="shared"
        providerAvailability={NO_PROVIDER_AUTH}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByTestId("chat-model-option-cmdclaw-openai/gpt-5.4"));

    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it("selects shared GPT-5.4 when shared auth is available", () => {
    const onSelectionChange = vi.fn();

    render(
      <ModelSelector
        selectedModel="anthropic/claude-sonnet-4-6"
        selectedAuthSource="shared"
        providerAvailability={SHARED_ONLY_AUTH}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByTestId("chat-model-option-cmdclaw-openai/gpt-5.4"));

    expect(onSelectionChange).toHaveBeenCalledWith({
      model: "openai/gpt-5.4",
      authSource: "shared",
    });
  });
});
