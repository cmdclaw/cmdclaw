// @vitest-environment jsdom

import type { ComponentProps } from "react";
import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolApprovalCard } from "./tool-approval-card";

void jestDomVitest;

vi.mock("next/image", () => ({
  // oxlint-disable-next-line eslint-plugin-next/no-img-element
  default: (props: ComponentProps<"img">) => <img {...props} alt={props.alt} />,
}));

const QUESTION_TOOL_INPUT = {
  questions: [
    {
      header: "Pick",
      question: "Choose one",
      options: [{ label: "Alpha" }, { label: "Beta" }],
      custom: true,
    },
  ],
};
const APPROVED_QUESTION_ANSWERS = [["Beta"]];
const MULTI_APPROVED_ANSWERS: string[][] = [["A"], ["D"], ["E"]];

const MULTI_QUESTION_TOOL_INPUT = {
  questions: [
    {
      header: "First",
      question: "Choose first",
      options: [{ label: "A" }, { label: "B" }],
      custom: true,
    },
    {
      header: "Second",
      question: "Choose second",
      options: [{ label: "C" }, { label: "D" }],
      custom: true,
    },
    {
      header: "Third",
      question: "Choose third",
      options: [{ label: "E" }, { label: "F" }],
      custom: false,
    },
  ],
};

afterEach(() => {
  cleanup();
});

describe("ToolApprovalCard", () => {
  it("submits a typed custom answer with the submit button", () => {
    const onApprove = vi.fn();

    render(
      <ToolApprovalCard
        toolUseId="question-1"
        toolName="question"
        toolInput={QUESTION_TOOL_INPUT}
        integration="cmdclaw"
        operation="question"
        onApprove={onApprove}
        onDeny={vi.fn()}
        status="pending"
      />,
    );

    fireEvent.click(screen.getByTestId("question-typed-toggle-0"));
    fireEvent.change(screen.getByTestId("question-typed-input-0"), {
      target: { value: "Gamma" },
    });
    fireEvent.click(screen.getByTestId("question-typed-submit-0"));

    expect(onApprove).toHaveBeenCalledWith([["Gamma"]]);
  });

  it("renders approved questions with the prompt and saved answer", () => {
    render(
      <ToolApprovalCard
        toolUseId="question-2"
        toolName="question"
        toolInput={QUESTION_TOOL_INPUT}
        integration="cmdclaw"
        operation="question"
        command="Question: undefined"
        questionAnswers={APPROVED_QUESTION_ANSWERS}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        status="approved"
      />,
    );

    expect(screen.getAllByText("Choose one")).not.toHaveLength(0);
    expect(screen.getByText("Saved answer")).toBeInTheDocument();
    expect(screen.getAllByText("Beta")).not.toHaveLength(0);
    expect(screen.queryByText("Question: undefined")).not.toBeInTheDocument();
  });

  describe("multi-question wizard", () => {
    it("shows only the first question initially with dot indicators", () => {
      render(
        <ToolApprovalCard
          toolUseId="wiz-1"
          toolName="question"
          toolInput={MULTI_QUESTION_TOOL_INPUT}
          integration="cmdclaw"
          operation="question"
          onApprove={vi.fn()}
          onDeny={vi.fn()}
          status="pending"
        />,
      );

      // First question visible
      expect(screen.getByText("Choose first")).toBeInTheDocument();
      // Second question NOT visible
      expect(screen.queryByText("Choose second")).not.toBeInTheDocument();
      // Dot indicators present
      expect(screen.getByLabelText("Question 1 of 3")).toBeInTheDocument();
    });

    it("auto-advances to next question on single-select click", () => {
      const onApprove = vi.fn();

      render(
        <ToolApprovalCard
          toolUseId="wiz-2"
          toolName="question"
          toolInput={MULTI_QUESTION_TOOL_INPUT}
          integration="cmdclaw"
          operation="question"
          onApprove={onApprove}
          onDeny={vi.fn()}
          status="pending"
        />,
      );

      // Click first option on first question
      fireEvent.click(screen.getByTestId("question-option-0-A"));

      // Now second question should be visible (step change is synchronous)
      expect(screen.getByText("Choose second")).toBeInTheDocument();
      expect(screen.queryByText("Choose first")).not.toBeInTheDocument();

      // Not yet submitted (still has more questions)
      expect(onApprove).not.toHaveBeenCalled();
    });

    it("submits all answers after answering the last question", () => {
      const onApprove = vi.fn();

      render(
        <ToolApprovalCard
          toolUseId="wiz-3"
          toolName="question"
          toolInput={MULTI_QUESTION_TOOL_INPUT}
          integration="cmdclaw"
          operation="question"
          onApprove={onApprove}
          onDeny={vi.fn()}
          status="pending"
        />,
      );

      // Answer question 1
      fireEvent.click(screen.getByTestId("question-option-0-A"));

      // Answer question 2
      fireEvent.click(screen.getByTestId("question-option-1-D"));

      // Answer question 3 (last one)
      fireEvent.click(screen.getByTestId("question-option-2-E"));

      // Should have submitted with all answers
      expect(onApprove).toHaveBeenCalledWith([["A"], ["D"], ["E"]]);
    });

    it("shows all saved answers in completed state", () => {
      render(
        <ToolApprovalCard
          toolUseId="wiz-4"
          toolName="question"
          toolInput={MULTI_QUESTION_TOOL_INPUT}
          integration="cmdclaw"
          operation="question"
          questionAnswers={MULTI_APPROVED_ANSWERS}
          onApprove={vi.fn()}
          onDeny={vi.fn()}
          status="approved"
        />,
      );

      // All questions and answers should be visible
      expect(screen.getByText("Choose first")).toBeInTheDocument();
      expect(screen.getByText("Choose second")).toBeInTheDocument();
      expect(screen.getByText("Choose third")).toBeInTheDocument();
      expect(screen.getAllByText("Saved answer")).toHaveLength(3);
    });
  });
});
