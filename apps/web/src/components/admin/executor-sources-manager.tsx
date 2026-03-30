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
  headersText: string;
  queryParamsText: string;
  defaultHeadersText: string;
  authType: "none" | "api_key" | "bearer";
  authHeaderName: string;
  authQueryParam: string;
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
  headersText: "",
  queryParamsText: "",
  defaultHeadersText: "",
  authType: "bearer",
  authHeaderName: "Authorization",
  authQueryParam: "",
  authPrefix: "Bearer ",
  secret: "",
  displayName: "",
};

function formatStringMap(value: Record<string, string> | null | undefined): string {
  if (!value || Object.keys(value).length === 0) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

function parseStringMap(value: string, label: string): Record<string, string> | undefined {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return undefined;
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(trimmedValue);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (!parsedValue || typeof parsedValue !== "object" || Array.isArray(parsedValue)) {
    throw new Error(`${label} must be a JSON object with string values.`);
  }

  const entries = Object.entries(parsedValue);
  if (
    entries.some(([key, entryValue]) => typeof key !== "string" || typeof entryValue !== "string")
  ) {
    throw new Error(`${label} must be a JSON object with string values.`);
  }

  return Object.fromEntries(entries);
}

function getSourceFormState(source: ExecutorSourceListItem): ExecutorSourceFormState {
  return {
    kind: source.kind,
    name: source.name,
    namespace: source.namespace,
    endpoint: source.endpoint,
    specUrl: source.specUrl ?? "",
    transport: source.transport ?? "streamable-http",
    headersText: formatStringMap(source.headers),
    queryParamsText: formatStringMap(source.queryParams),
    defaultHeadersText: formatStringMap(source.defaultHeaders),
    authType: source.authType,
    authHeaderName: source.authHeaderName ?? "",
    authQueryParam: source.authQueryParam ?? "",
    authPrefix: source.authPrefix ?? "",
    secret: "",
    displayName: source.credentialDisplayName ?? "",
  };
}

function buildMutationInputFromForm(form: ExecutorSourceFormState): ExecutorSourceMutationInput {
  const authPrefix = form.authPrefix.trim().length > 0 ? form.authPrefix : null;

  return {
    kind: form.kind,
    name: form.name.trim(),
    namespace: form.namespace.trim(),
    endpoint: form.endpoint.trim(),
    specUrl: form.kind === "openapi" ? form.specUrl.trim() || null : null,
    transport: form.kind === "mcp" ? form.transport.trim() || null : null,
    headers: form.kind === "mcp" ? parseStringMap(form.headersText, "Headers") : undefined,
    queryParams:
      form.kind === "mcp" ? parseStringMap(form.queryParamsText, "Query params") : undefined,
    defaultHeaders:
      form.kind === "openapi"
        ? parseStringMap(form.defaultHeadersText, "Default headers")
        : undefined,
    authType: form.authType,
    authHeaderName: form.authType === "none" ? null : form.authHeaderName.trim() || null,
    authQueryParam:
      form.kind === "mcp" && form.authType === "api_key"
        ? form.authQueryParam.trim() || null
        : null,
    authPrefix: form.authType === "bearer" ? authPrefix : null,
  };
}

function JsonMapField({
  id,
  label,
  placeholder,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        spellCheck={false}
        className="border-input bg-background mt-2 min-h-28 w-full rounded-md border px-3 py-2 font-mono text-sm outline-none"
      />
    </div>
  );
}

function ExecutorSourceFields({
  form,
  formIdPrefix,
  onFieldChange,
}: {
  form: ExecutorSourceFormState;
  formIdPrefix: string;
  onFieldChange: (field: keyof ExecutorSourceFormState, value: string) => void;
}) {
  const handleFieldInputChange = useCallback(
    (field: keyof ExecutorSourceFormState) =>
      (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        onFieldChange(field, event.target.value);
      },
    [onFieldChange],
  );

  const handleKindChange = useCallback(
    (value: string) => {
      onFieldChange("kind", value);
    },
    [onFieldChange],
  );

  const handleAuthTypeChange = useCallback(
    (value: string) => {
      onFieldChange("authType", value);
    },
    [onFieldChange],
  );

  return (
    <>
      <div className="space-y-2">
        <label htmlFor={`${formIdPrefix}-kind`} className="text-sm font-medium">
          Kind
        </label>
        <Select value={form.kind} onValueChange={handleKindChange}>
          <SelectTrigger id={`${formIdPrefix}-kind`}>
            <SelectValue placeholder="Select source type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openapi">OpenAPI</SelectItem>
            <SelectItem value="mcp">Remote MCP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formIdPrefix}-auth-type`} className="text-sm font-medium">
          Auth
        </label>
        <Select value={form.authType} onValueChange={handleAuthTypeChange}>
          <SelectTrigger id={`${formIdPrefix}-auth-type`}>
            <SelectValue placeholder="Select auth" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bearer">Bearer token</SelectItem>
            <SelectItem value="api_key">API key</SelectItem>
            <SelectItem value="none">No auth</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formIdPrefix}-name`} className="text-sm font-medium">
          Name
        </label>
        <Input
          id={`${formIdPrefix}-name`}
          value={form.name}
          onChange={handleFieldInputChange("name")}
          placeholder="Display name"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${formIdPrefix}-namespace`} className="text-sm font-medium">
          Namespace
        </label>
        <Input
          id={`${formIdPrefix}-namespace`}
          value={form.namespace}
          onChange={handleFieldInputChange("namespace")}
          placeholder="Namespace (for example salesforce-prod)"
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <label htmlFor={`${formIdPrefix}-endpoint`} className="text-sm font-medium">
          Endpoint
        </label>
        <Input
          id={`${formIdPrefix}-endpoint`}
          value={form.endpoint}
          onChange={handleFieldInputChange("endpoint")}
          placeholder="Endpoint URL"
        />
      </div>

      {form.kind === "openapi" ? (
        <>
          <div className="space-y-2 md:col-span-2">
            <label htmlFor={`${formIdPrefix}-spec-url`} className="text-sm font-medium">
              OpenAPI spec URL
            </label>
            <Input
              id={`${formIdPrefix}-spec-url`}
              value={form.specUrl}
              onChange={handleFieldInputChange("specUrl")}
              placeholder="OpenAPI spec URL"
            />
          </div>
          <JsonMapField
            id={`${formIdPrefix}-default-headers`}
            label="Default headers"
            value={form.defaultHeadersText}
            onChange={handleFieldInputChange("defaultHeadersText")}
            placeholder={`{\n  "X-Region": "eu-west-1"\n}`}
            className="md:col-span-2"
          />
        </>
      ) : (
        <>
          <div className="space-y-2 md:col-span-2">
            <label htmlFor={`${formIdPrefix}-transport`} className="text-sm font-medium">
              Transport
            </label>
            <Input
              id={`${formIdPrefix}-transport`}
              value={form.transport}
              onChange={handleFieldInputChange("transport")}
              placeholder="Transport (for example streamable-http)"
            />
          </div>
          <JsonMapField
            id={`${formIdPrefix}-headers`}
            label="Headers"
            value={form.headersText}
            onChange={handleFieldInputChange("headersText")}
            placeholder={`{\n  "X-Team": "sales"\n}`}
          />
          <JsonMapField
            id={`${formIdPrefix}-query-params`}
            label="Query params"
            value={form.queryParamsText}
            onChange={handleFieldInputChange("queryParamsText")}
            placeholder={`{\n  "region": "eu"\n}`}
          />
        </>
      )}

      {form.authType !== "none" ? (
        <>
          <div className="space-y-2">
            <label htmlFor={`${formIdPrefix}-auth-header-name`} className="text-sm font-medium">
              Auth header name
            </label>
            <Input
              id={`${formIdPrefix}-auth-header-name`}
              value={form.authHeaderName}
              onChange={handleFieldInputChange("authHeaderName")}
              placeholder="Auth header name"
            />
          </div>

          {form.kind === "mcp" && form.authType === "api_key" ? (
            <div className="space-y-2">
              <label htmlFor={`${formIdPrefix}-auth-query-param`} className="text-sm font-medium">
                Auth query param
              </label>
              <Input
                id={`${formIdPrefix}-auth-query-param`}
                value={form.authQueryParam}
                onChange={handleFieldInputChange("authQueryParam")}
                placeholder="Optional query param name"
              />
            </div>
          ) : (
            <div />
          )}

          <div className="space-y-2 md:col-span-2">
            <label htmlFor={`${formIdPrefix}-auth-prefix`} className="text-sm font-medium">
              Auth prefix
            </label>
            <Input
              id={`${formIdPrefix}-auth-prefix`}
              value={form.authType === "bearer" ? form.authPrefix : ""}
              onChange={handleFieldInputChange("authPrefix")}
              placeholder="Auth prefix"
              disabled={form.authType !== "bearer"}
            />
          </div>
        </>
      ) : null}
    </>
  );
}

function ExecutorSourceCard({
  source,
  canManageExecutorSources,
  isUpdatingSource,
  isDeletingSource,
  isSavingCredential,
  isDisconnectingCredential,
  isTogglingCredential,
  onUpdateSource,
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
  onUpdateSource: (input: ExecutorSourceMutationInput & { id: string }) => Promise<void>;
  onToggleSource: (sourceId: string, enabled: boolean) => void | Promise<void>;
  onDeleteSource: (sourceId: string) => void | Promise<void>;
  onSaveCredential: (sourceId: string, secret: string, displayName: string) => void | Promise<void>;
  onDisconnectCredential: (sourceId: string) => void | Promise<void>;
  onToggleCredential: (sourceId: string, enabled: boolean) => void | Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<ExecutorSourceFormState>(() =>
    getSourceFormState(source),
  );
  const [secret, setSecret] = useState("");
  const [displayName, setDisplayName] = useState(source.credentialDisplayName ?? "");

  useEffect(() => {
    setEditForm(getSourceFormState(source));
    setDisplayName(source.credentialDisplayName ?? "");
  }, [source]);

  const handleEditFieldChange = useCallback(
    (field: keyof ExecutorSourceFormState, value: string) => {
      setEditForm((current) => ({
        ...current,
        [field]: value,
      }));
    },
    [],
  );

  const handleSourceEnabledChange = useCallback(
    (value: boolean) => {
      void onToggleSource(source.id, value);
    },
    [onToggleSource, source.id],
  );

  const handleDeleteClick = useCallback(() => {
    void onDeleteSource(source.id);
  }, [onDeleteSource, source.id]);

  const handleEditClick = useCallback(() => {
    setEditForm(getSourceFormState(source));
    setIsEditing(true);
  }, [source]);

  const handleCancelEditClick = useCallback(() => {
    setEditForm(getSourceFormState(source));
    setIsEditing(false);
  }, [source]);

  const handleSaveEdit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      try {
        await onUpdateSource({
          id: source.id,
          ...buildMutationInputFromForm(editForm),
          enabled: source.enabled,
        });
        setIsEditing(false);
        toast.success("Executor source updated.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update executor source.");
      }
    },
    [editForm, onUpdateSource, source.enabled, source.id],
  );

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
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditClick}
                disabled={isUpdatingSource}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteClick}
                disabled={isDeletingSource}
              >
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <form
          aria-label={`Edit ${source.name} executor source`}
          onSubmit={handleSaveEdit}
          className="grid gap-3 rounded-lg border border-dashed p-4 md:grid-cols-2"
        >
          <ExecutorSourceFields
            form={editForm}
            formIdPrefix={`executor-source-${source.id}`}
            onFieldChange={handleEditFieldChange}
          />

          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="ghost" onClick={handleCancelEditClick}>
              Cancel
            </Button>
            <Button type="submit" disabled={isUpdatingSource}>
              {isUpdatingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
          </div>
        </form>
      ) : null}

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
        const result = await onCreateSource(buildMutationInputFromForm(executorForm));

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
        <form
          aria-label="Create executor source"
          onSubmit={handleCreateExecutorSource}
          className="mt-4 grid gap-3 md:grid-cols-2"
        >
          <ExecutorSourceFields
            form={executorForm}
            formIdPrefix="executor-source-create"
            onFieldChange={handleExecutorFieldChange}
          />

          {executorForm.authType !== "none" ? (
            <>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="executor-source-create-secret" className="text-sm font-medium">
                  Credential secret
                </label>
                <Input
                  id="executor-source-create-secret"
                  value={executorForm.secret}
                  onChange={handleExecutorSecretChange}
                  placeholder="Your credential secret (optional at create time)"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label
                  htmlFor="executor-source-create-display-name"
                  className="text-sm font-medium"
                >
                  Credential label
                </label>
                <Input
                  id="executor-source-create-display-name"
                  value={executorForm.displayName}
                  onChange={handleExecutorDisplayNameChange}
                  placeholder="Credential label (optional)"
                />
              </div>
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
              onUpdateSource={onUpdateSource}
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
