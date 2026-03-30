// @vitest-environment jsdom

import * as jestDomVitest from "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

void jestDomVitest;

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

import { ExecutorSourcesManager } from "./executor-sources-manager";

const openApiSource = {
  id: "source-openapi",
  name: "HubSpot",
  namespace: "hubspot-prod",
  kind: "openapi" as const,
  endpoint: "https://api.hubspot.com",
  enabled: true,
  connected: false,
  credentialEnabled: false,
  credentialDisplayName: null,
  specUrl: "https://api.hubspot.com/openapi.json",
  transport: null,
  headers: null,
  queryParams: null,
  defaultHeaders: { "X-Region": "us-east-1" },
  authType: "bearer" as const,
  authHeaderName: "Authorization",
  authQueryParam: null,
  authPrefix: "Bearer ",
};

const mcpSource = {
  id: "source-mcp",
  name: "CRM MCP",
  namespace: "crm-mcp",
  kind: "mcp" as const,
  endpoint: "https://mcp.example.com",
  enabled: true,
  connected: false,
  credentialEnabled: false,
  credentialDisplayName: null,
  specUrl: null,
  transport: "streamable-http",
  headers: { "X-Team": "sales" },
  queryParams: { region: "us" },
  defaultHeaders: null,
  authType: "api_key" as const,
  authHeaderName: "X-API-Key",
  authQueryParam: "token",
  authPrefix: null,
};

const openApiData = { sources: [openApiSource] };
const mcpData = { sources: [mcpSource] };

describe("ExecutorSourcesManager", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves edits for an existing OpenAPI executor source", async () => {
    const onUpdateSource = vi.fn().mockResolvedValue(undefined);

    render(
      <ExecutorSourcesManager
        data={openApiData}
        isLoading={false}
        canManageExecutorSources
        createPending={false}
        updatePending={false}
        deletePending={false}
        saveCredentialPending={false}
        disconnectCredentialPending={false}
        toggleCredentialPending={false}
        onCreateSource={vi.fn()}
        onUpdateSource={onUpdateSource}
        onDeleteSource={vi.fn()}
        onSaveCredential={vi.fn()}
        onDisconnectCredential={vi.fn()}
        onToggleCredential={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const editForm = screen.getByRole("form", { name: /Edit HubSpot executor source/i });
    fireEvent.change(within(editForm).getByLabelText("Name"), {
      target: { value: "HubSpot EU" },
    });
    fireEvent.change(within(editForm).getByLabelText("Default headers"), {
      target: { value: '{\n  "X-Region": "eu-west-1",\n  "X-Env": "prod"\n}' },
    });

    fireEvent.click(within(editForm).getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(onUpdateSource).toHaveBeenCalledWith({
        id: "source-openapi",
        kind: "openapi",
        name: "HubSpot EU",
        namespace: "hubspot-prod",
        endpoint: "https://api.hubspot.com",
        specUrl: "https://api.hubspot.com/openapi.json",
        transport: null,
        headers: undefined,
        queryParams: undefined,
        defaultHeaders: {
          "X-Region": "eu-west-1",
          "X-Env": "prod",
        },
        authType: "bearer",
        authHeaderName: "Authorization",
        authQueryParam: null,
        authPrefix: "Bearer ",
        enabled: true,
      });
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Executor source updated.");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("saves MCP-specific fields for an existing executor source", async () => {
    const onUpdateSource = vi.fn().mockResolvedValue(undefined);

    render(
      <ExecutorSourcesManager
        data={mcpData}
        isLoading={false}
        canManageExecutorSources
        createPending={false}
        updatePending={false}
        deletePending={false}
        saveCredentialPending={false}
        disconnectCredentialPending={false}
        toggleCredentialPending={false}
        onCreateSource={vi.fn()}
        onUpdateSource={onUpdateSource}
        onDeleteSource={vi.fn()}
        onSaveCredential={vi.fn()}
        onDisconnectCredential={vi.fn()}
        onToggleCredential={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const editForm = screen.getByRole("form", { name: /Edit CRM MCP executor source/i });
    fireEvent.change(within(editForm).getByLabelText("Transport"), {
      target: { value: "sse" },
    });
    fireEvent.change(within(editForm).getByLabelText("Headers"), {
      target: { value: '{\n  "X-Team": "support"\n}' },
    });
    fireEvent.change(within(editForm).getByLabelText("Query params"), {
      target: { value: '{\n  "region": "eu"\n}' },
    });
    fireEvent.change(within(editForm).getByLabelText("Auth query param"), {
      target: { value: "api_token" },
    });

    fireEvent.click(within(editForm).getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(onUpdateSource).toHaveBeenCalledWith({
        id: "source-mcp",
        kind: "mcp",
        name: "CRM MCP",
        namespace: "crm-mcp",
        endpoint: "https://mcp.example.com",
        specUrl: null,
        transport: "sse",
        headers: { "X-Team": "support" },
        queryParams: { region: "eu" },
        defaultHeaders: undefined,
        authType: "api_key",
        authHeaderName: "X-API-Key",
        authQueryParam: "api_token",
        authPrefix: null,
        enabled: true,
      });
    });

    expect(toastSuccessMock).toHaveBeenCalledWith("Executor source updated.");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
