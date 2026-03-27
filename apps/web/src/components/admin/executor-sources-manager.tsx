"use client";

import type { ChangeEvent, FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type ExecutorSourceFormState = {
  kind: "mcp" | "openapi";
  name: string;
  namespace: string;
  endpoint: string;
  specUrl: string;
  transport: string;
  authType: "none" | "api_key" | "bearer";
  authHeaderName: string;
  authPrefix: string;
  secret: string;
  displayName: string;
};

type ExecutorSourceListItem = {
  id: string;
  name: string;
  namespace: string;
  kind: "mcp" | "openapi";
  endpoint: string;
  enabled: boolean;
  connected: boolean;
  credentialEnabled: boolean;
  credentialDisplayName: string | null;
  specUrl: string | null;
  transport: string | null;
  headers: Record<string, string> | null;
  queryParams: Record<string, string> | null;
  defaultHeaders: Record<string, string> | null;
  authType: "none" | "api_key" | "bearer";
  authHeaderName: string | null;
  authQueryParam: string | null;
  authPrefix: string | null;
};

type ExecutorSourceListData = {
  packageRevisionHash?: string | null;
  sources?: ExecutorSourceListItem[];
};

type ExecutorSourceMutationInput = {
  kind: "mcp" | "openapi";
  name: string;
  namespace: string;
  endpoint: string;
  specUrl?: string | null;
  transport?: string | null;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  defaultHeaders?: Record<string, string>;
  authType?: "none" | "api_key" | "bearer";
  authHeaderName?: string | null;
  authQueryParam?: string | null;
  authPrefix?: string | null;
  enabled?: boolean;
};

const DEFAULT_EXECUTOR_SOURCE_FORM: ExecutorSourceFormState = {
  kind: "openapi",
  name: "",
  namespace: "",
  endpoint: "",
  specUrl: "",
  transport: "streamable-http",
  authType: "bearer",
  authHeaderName: "Authorization",
  authPrefix: "Bearer ",
  secret: "",
  displayName: "",
};

function ExecutorSourceCard({
  source,
  canManageExecutorSources,
  isUpdatingSource,
  isDeletingSource,
  isSavingCredential,
  isDisconnectingCredential,
  isTogglingCredential,
  onToggleSource,
  onDeleteSource,
  onSaveCredential,
  onDisconnectCredential,
  onToggleCredential,
}: {
  source: ExecutorSourceListItem;
  canManageExecutorSources: boolean;
  isUpdatingSource: boolean;
  isDeletingSource: boolean;
  isSavingCredential: boolean;
  isDisconnectingCredential: boolean;
  isTogglingCredential: boolean;
  onToggleSource: (sourceId: string, enabled: boolean) => void | Promise<void>;
  onDeleteSource: (sourceId: string) => void | Promise<void>;
  onSaveCredential: (sourceId: string, secret: string, displayName: string) => void | Promise<void>;
  onDisconnectCredential: (sourceId: string) => void | Promise<void>;
  onToggleCredential: (sourceId: string, enabled: boolean) => void | Promise<void>;
}) {
  const [secret, setSecret] = useState("");
  const [displayName, setDisplayName] = useState(source.credentialDisplayName ?? "");

  useEffect(() => {
    setDisplayName(source.credentialDisplayName ?? "");
  }, [source.credentialDisplayName]);

  const handleSourceEnabledChange = useCallback(
    (value: boolean) => {
      void onToggleSource(source.id, value);
    },
    [onToggleSource, source.id],
  );

  const handleDeleteClick = useCallback(() => {
    void onDeleteSource(source.id);
  }, [onDeleteSource, source.id]);

  const handleSecretChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSecret(event.target.value);
  }, []);

  const handleDisplayNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDisplayName(event.target.value);
  }, []);

  const handleSaveCredentialClick = useCallback(() => {
    void onSaveCredential(source.id, secret, displayName);
  }, [displayName, onSaveCredential, secret, source.id]);

  const handleDisconnectClick = useCallback(() => {
    void onDisconnectCredential(source.id);
  }, [onDisconnectCredential, source.id]);

  const handleCredentialEnabledChange = useCallback(
    (value: boolean) => {
      void onToggleCredential(source.id, value);
    },
    [onToggleCredential, source.id],
  );

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">{source.name}</p>
          <p className="text-muted-foreground text-sm">
            {source.namespace} · {source.kind} · {source.endpoint}
          </p>
          <p className="text-muted-foreground text-xs">
            Source {source.enabled ? "enabled" : "disabled"} · Credential{" "}
            {source.connected
              ? source.credentialEnabled
                ? "connected"
                : "saved but disabled"
              : "not connected"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Source enabled</span>
            <Switch
              checked={source.enabled}
              disabled={!canManageExecutorSources || isUpdatingSource}
              onCheckedChange={handleSourceEnabledChange}
            />
          </div>
          {canManageExecutorSources ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteClick}
              disabled={isDeletingSource}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_220px_auto_auto]">
        <Input
          value={secret}
          onChange={handleSecretChange}
          placeholder={source.connected ? "Update your secret" : "Connect your personal credential"}
        />
        <Input
          value={displayName}
          onChange={handleDisplayNameChange}
          placeholder="Credential label"
        />
        <Button variant="outline" onClick={handleSaveCredentialClick} disabled={isSavingCredential}>
          {source.connected ? "Update secret" : "Connect"}
        </Button>
        {source.connected ? (
          <Button
            variant="ghost"
            onClick={handleDisconnectClick}
            disabled={isDisconnectingCredential}
          >
            Disconnect
          </Button>
        ) : null}
      </div>

      {source.connected ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Credential enabled</span>
          <Switch
            checked={source.credentialEnabled}
            disabled={isTogglingCredential}
            onCheckedChange={handleCredentialEnabledChange}
          />
        </div>
      ) : null}
    </div>
  );
}

export function ExecutorSourcesManager({
  data,
  isLoading,
  canManageExecutorSources,
  createPending,
  updatePending,
  deletePending,
  saveCredentialPending,
  disconnectCredentialPending,
  toggleCredentialPending,
  onCreateSource,
  onUpdateSource,
  onDeleteSource,
  onSaveCredential,
  onDisconnectCredential,
  onToggleCredential,
}: {
  data: ExecutorSourceListData | undefined;
  isLoading: boolean;
  canManageExecutorSources: boolean;
  createPending: boolean;
  updatePending: boolean;
  deletePending: boolean;
  saveCredentialPending: boolean;
  disconnectCredentialPending: boolean;
  toggleCredentialPending: boolean;
  onCreateSource: (input: ExecutorSourceMutationInput) => Promise<{ id: string } | void>;
  onUpdateSource: (input: ExecutorSourceMutationInput & { id: string }) => Promise<void>;
  onDeleteSource: (sourceId: string) => Promise<void>;
  onSaveCredential: (sourceId: string, secret: string, displayName: string) => Promise<void>;
  onDisconnectCredential: (sourceId: string) => Promise<void>;
  onToggleCredential: (sourceId: string, enabled: boolean) => Promise<void>;
}) {
  const [executorForm, setExecutorForm] = useState<ExecutorSourceFormState>(
    DEFAULT_EXECUTOR_SOURCE_FORM,
  );

  const executorSources = useMemo(() => data?.sources ?? [], [data?.sources]);

  const handleExecutorFieldChange = useCallback(
    (field: keyof ExecutorSourceFormState, value: string) => {
      setExecutorForm((current) => ({
        ...current,
        [field]: value,
      }));
    },
    [],
  );

  const handleExecutorKindChange = useCallback(
    (value: string) => {
      handleExecutorFieldChange("kind", value);
    },
    [handleExecutorFieldChange],
  );

  const handleExecutorAuthTypeChange = useCallback(
    (value: string) => {
      handleExecutorFieldChange("authType", value);
    },
    [handleExecutorFieldChange],
  );

  const handleExecutorNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleExecutorFieldChange("name", event.target.value);
    },
    [handleExecutorFieldChange],
  );

  const handleExecutorNamespaceChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleExecutorFieldChange("namespace", event.target.value);
    },
    [handleExecutorFieldChange],
  );

  const handleExecutorEndpointChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleExecutorFieldChange("endpoint", event.target.value);
    },
    [handleExecutorFieldChange],
  );

  const handleExecutorSpecUrlChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleExecutorFieldChange("specUrl", event.target.value);
    },
    [handleExecutorFieldChange],
  );

  const handleExecutorTransportChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleExecutorFieldChange("transport", event.target.value);
    },
    [handleExecutorFieldChange],
  );

  const handleExecutorAuthHeaderNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleExecutorFieldChange("authHeaderName", event.target.value);
    },
    [handleExecutorFieldChange],
  );

  const handleExecutorAuthPrefixChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleExecutorFieldChange("authPrefix", event.target.value);
    },
    [handleExecutorFieldChange],
  );

  const handleExecutorSecretChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleExecutorFieldChange("secret", event.target.value);
    },
    [handleExecutorFieldChange],
  );

  const handleExecutorDisplayNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleExecutorFieldChange("displayName", event.target.value);
    },
    [handleExecutorFieldChange],
  );

  const handleCreateExecutorSource = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      try {
        const result = await onCreateSource({
          kind: executorForm.kind,
          name: executorForm.name,
          namespace: executorForm.namespace,
          endpoint: executorForm.endpoint,
          specUrl: executorForm.kind === "openapi" ? executorForm.specUrl : null,
          transport: executorForm.kind === "mcp" ? executorForm.transport : null,
          authType: executorForm.authType,
          authHeaderName: executorForm.authHeaderName || null,
          authPrefix: executorForm.authType === "bearer" ? executorForm.authPrefix || null : null,
        });

        if (executorForm.secret.trim() && result?.id) {
          await onSaveCredential(result.id, executorForm.secret, executorForm.displayName);
        }

        setExecutorForm(DEFAULT_EXECUTOR_SOURCE_FORM);
        toast.success("Executor source added.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add executor source.");
      }
    },
    [executorForm, onCreateSource, onSaveCredential],
  );

  const handleToggleExecutorSource = useCallback(
    async (sourceId: string, enabled: boolean) => {
      const source = executorSources.find((entry) => entry.id === sourceId);
      if (!source) {
        return;
      }

      try {
        await onUpdateSource({
          id: source.id,
          kind: source.kind,
          name: source.name,
          namespace: source.namespace,
          endpoint: source.endpoint,
          specUrl: source.specUrl,
          transport: source.transport,
          headers: source.headers ?? undefined,
          queryParams: source.queryParams ?? undefined,
          defaultHeaders: source.defaultHeaders ?? undefined,
          authType: source.authType,
          authHeaderName: source.authHeaderName,
          authQueryParam: source.authQueryParam,
          authPrefix: source.authPrefix,
          enabled,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update executor source.");
      }
    },
    [executorSources, onUpdateSource],
  );

  const handleSaveExecutorCredential = useCallback(
    async (sourceId: string, secretInput: string, displayNameInput: string) => {
      const secret = secretInput.trim();
      if (!secret) {
        toast.error("Enter a secret first.");
        return;
      }

      try {
        await onSaveCredential(sourceId, secret, displayNameInput.trim());
        toast.success("Credential saved.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save credential.");
      }
    },
    [onSaveCredential],
  );

  const handleDisconnectExecutorCredential = useCallback(
    async (sourceId: string) => {
      try {
        await onDisconnectCredential(sourceId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to disconnect credential.");
      }
    },
    [onDisconnectCredential],
  );

  const handleToggleExecutorCredential = useCallback(
    async (sourceId: string, enabled: boolean) => {
      try {
        await onToggleCredential(sourceId, enabled);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update credential.");
      }
    },
    [onToggleCredential],
  );

  return (
    <div>
      {data?.packageRevisionHash ? (
        <p className="text-muted-foreground mt-3 text-xs">
          Cached package revision: {data.packageRevisionHash.slice(0, 12)}
        </p>
      ) : null}

      {canManageExecutorSources ? (
        <form onSubmit={handleCreateExecutorSource} className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Kind</label>
            <Select value={executorForm.kind} onValueChange={handleExecutorKindChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select source type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openapi">OpenAPI</SelectItem>
                <SelectItem value="mcp">Remote MCP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Auth</label>
            <Select value={executorForm.authType} onValueChange={handleExecutorAuthTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select auth" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bearer">Bearer token</SelectItem>
                <SelectItem value="api_key">API key</SelectItem>
                <SelectItem value="none">No auth</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Input
            value={executorForm.name}
            onChange={handleExecutorNameChange}
            placeholder="Display name"
          />
          <Input
            value={executorForm.namespace}
            onChange={handleExecutorNamespaceChange}
            placeholder="Namespace (for example salesforce-prod)"
          />
          <Input
            value={executorForm.endpoint}
            onChange={handleExecutorEndpointChange}
            placeholder="Endpoint URL"
            className="md:col-span-2"
          />

          {executorForm.kind === "openapi" ? (
            <Input
              value={executorForm.specUrl}
              onChange={handleExecutorSpecUrlChange}
              placeholder="OpenAPI spec URL"
              className="md:col-span-2"
            />
          ) : (
            <Input
              value={executorForm.transport}
              onChange={handleExecutorTransportChange}
              placeholder="Transport (for example streamable-http)"
              className="md:col-span-2"
            />
          )}

          {executorForm.authType !== "none" ? (
            <>
              <Input
                value={executorForm.authHeaderName}
                onChange={handleExecutorAuthHeaderNameChange}
                placeholder="Auth header name"
              />
              <Input
                value={executorForm.authType === "bearer" ? executorForm.authPrefix : ""}
                onChange={handleExecutorAuthPrefixChange}
                placeholder="Auth prefix"
                disabled={executorForm.authType !== "bearer"}
              />
              <Input
                value={executorForm.secret}
                onChange={handleExecutorSecretChange}
                placeholder="Your credential secret (optional at create time)"
                className="md:col-span-2"
              />
              <Input
                value={executorForm.displayName}
                onChange={handleExecutorDisplayNameChange}
                placeholder="Credential label (optional)"
                className="md:col-span-2"
              />
            </>
          ) : null}

          <div className="flex justify-end md:col-span-2">
            <Button type="submit" disabled={createPending || !canManageExecutorSources}>
              {createPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add source"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">
          Admin access is required to add or edit shared Executor sources.
        </p>
      )}

      <div className="mt-5 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        ) : executorSources.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No workspace Executor sources have been configured yet.
          </p>
        ) : (
          executorSources.map((source) => (
            <ExecutorSourceCard
              key={source.id}
              source={source}
              canManageExecutorSources={canManageExecutorSources}
              isUpdatingSource={updatePending}
              isDeletingSource={deletePending}
              isSavingCredential={saveCredentialPending}
              isDisconnectingCredential={disconnectCredentialPending}
              isTogglingCredential={toggleCredentialPending}
              onToggleSource={handleToggleExecutorSource}
              onDeleteSource={onDeleteSource}
              onSaveCredential={handleSaveExecutorCredential}
              onDisconnectCredential={handleDisconnectExecutorCredential}
              onToggleCredential={handleToggleExecutorCredential}
            />
          ))
        )}
      </div>
    </div>
  );
}
