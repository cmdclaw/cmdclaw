// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const {
  mockCreateCoworkerMutateAsync,
  mockGetOrCreateBuilderConversation,
  mockStartGeneration,
  fetchMock,
  assignMock,
} = vi.hoisted(() => ({
  mockCreateCoworkerMutateAsync: vi.fn(),
  mockGetOrCreateBuilderConversation: vi.fn(),
  mockStartGeneration: vi.fn(),
  fetchMock: vi.fn(),
  assignMock: vi.fn(),
}));

vi.mock("@/orpc/hooks", () => ({
  useCreateCoworker: () => ({ mutateAsync: mockCreateCoworkerMutateAsync }),
}));

vi.mock("@/orpc/client", () => ({
  client: {
    coworker: {
      getOrCreateBuilderConversation: mockGetOrCreateBuilderConversation,
    },
    generation: {
      startGeneration: mockStartGeneration,
    },
  },
}));

import { TemplateDeployPage } from "./template-deploy-page";

describe("TemplateDeployPage", () => {
  beforeEach(() => {
    mockCreateCoworkerMutateAsync.mockReset();
    mockGetOrCreateBuilderConversation.mockReset();
    mockStartGeneration.mockReset();
    fetchMock.mockReset();
    assignMock.mockReset();

    mockCreateCoworkerMutateAsync.mockResolvedValue({ id: "cw-1" });
    mockGetOrCreateBuilderConversation.mockResolvedValue({ conversationId: "conv-1" });
    mockStartGeneration.mockResolvedValue({ generationId: "gen-1" });
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => `Create it with name {{name}}

Trigger

{{trigger_title}}

{{trigger_description}}

Instructions

{{instructions}}`,
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        assign: assignMock,
      },
    });
  });

  it("creates a coworker from the template and redirects to its editor", async () => {
    render(<TemplateDeployPage templateId="call-follow-up" />);

    await waitFor(() => {
      expect(mockCreateCoworkerMutateAsync).toHaveBeenCalledWith({
        name: "Send polished follow-ups right after every call",
        triggerType: "webhook",
        prompt: `Get call details with aircall_get_call using your Aircall connection ID.
Get transcription with aircall_get_transcription using your Aircall connection ID.
Extract the external participant phone number from number.raw_digits.
Search HubSpot contacts by phone with hubspot_search_contacts and request properties: email, firstname, lastname.
If contact payload is incomplete, call hubspot_get_contact to fill missing fields.
Generate a 2-3 sentence call summary and explicit action items for both parties.
If contact email exists, create a Gmail draft with friendly greeting, short summary, bullet action items, and professional closing.
Create a HubSpot task with subject 'Follow up on call with [Contact Name]', include summary + actions, and schedule for tomorrow at 9 AM.
If contact exists, associate task to contact using HUBSPOT_DEFINED association type 204.
If no contact is found, skip Gmail draft and still create the HubSpot task with the phone number in the body.`,
        allowedIntegrations: expect.any(Array),
      });
    });

    await waitFor(() => {
      expect(mockGetOrCreateBuilderConversation).toHaveBeenCalledWith({ id: "cw-1" });
      expect(mockStartGeneration).toHaveBeenCalledWith({
        conversationId: "conv-1",
        content: expect.stringContaining(
          "Create it with name Send polished follow-ups right after every call",
        ),
        model: "anthropic/claude-sonnet-4-6",
        autoApprove: true,
      });
      expect(assignMock).toHaveBeenCalledWith("/coworkers/cw-1");
    });
  });

  it("shows an error when the template id is invalid", async () => {
    render(<TemplateDeployPage templateId="missing" />);

    await waitFor(() => {
      expect(screen.getByText("Template not found.")).toBeInTheDocument();
    });

    expect(mockCreateCoworkerMutateAsync).not.toHaveBeenCalled();
  });

  it("still redirects when builder generation fails after create succeeds", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockStartGeneration.mockRejectedValue(new Error("builder failed"));

    render(<TemplateDeployPage templateId="call-follow-up" />);

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith("/coworkers/cw-1");
    });

    consoleErrorSpy.mockRestore();
  });
});
