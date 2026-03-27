"use client";

import type { ChangeEvent, FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { clientEditionCapabilities } from "@/lib/edition";
import {
  useBillingOverview,
  useCreateExecutorSource,
  useDeleteExecutorSource,
  useDisconnectExecutorSourceCredential,
  useExecutorSourceList,
  useInviteWorkspaceMembers,
  useRenameWorkspace,
  useSetExecutorSourceCredential,
  useSwitchWorkspace,
  useToggleExecutorSourceCredential,
  useUpdateExecutorSource,
  useWorkspaceMembers,
} from "@/orpc/hooks";

const EMPTY_WORKSPACE_OPTIONS: Array<{ id: string; name: string; role?: string }> = [];
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

const DEFAULT_EXECUTOR_SOURCE_FORM: ExecutorSourceFormState = {
  kind: "openapi" as const,
  name: "",
  namespace: "",
  endpoint: "",
  specUrl: "",
  transport: "streamable-http",
  authType: "bearer" as const,
  authHeaderName: "Authorization",
  authPrefix: "Bearer ",
  secret: "",
  displayName: "",
};

function WorkspaceRow({
  name,
  role,
  isActive,
  isPending,
  onSwitch,
  workspaceId,
}: {
  name: string;
  role: string;
  isActive: boolean;
  isPending: boolean;
  onSwitch: (id: string) => void;
  workspaceId: string;
}) {
  const handleClick = useCallback(() => {
    onSwitch(workspaceId);
  }, [onSwitch, workspaceId]);

  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-muted-foreground truncate text-xs capitalize">{role}</p>
      </div>
      {isActive ? (
        <span className="text-muted-foreground text-xs font-medium">Active</span>
      ) : (
        <Button variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Switch"}
        </Button>
      )}
    </div>
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
  onToggleSource,
  onDeleteSource,
  onSaveCredential,
  onDisconnectCredential,
  onToggleCredential,
}: {
  source: {
    id: string;
    name: string;
    namespace: string;
    kind: string;
    endpoint: string;
    enabled: boolean;
    connected: boolean;
    credentialEnabled: boolean;
    credentialDisplayName: string | null;
  };
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

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const { data, isLoading } = useBillingOverview();
  const inviteMembers = useInviteWorkspaceMembers();
  const renameWorkspace = useRenameWorkspace();
  const switchWorkspace = useSwitchWorkspace();
  const { data: executorData, isLoading: executorLoading } = useExecutorSourceList();
  const createExecutorSource = useCreateExecutorSource();
  const updateExecutorSource = useUpdateExecutorSource();
  const deleteExecutorSource = useDeleteExecutorSource();
  const setExecutorCredential = useSetExecutorSourceCredential();
  const disconnectExecutorCredential = useDisconnectExecutorSourceCredential();
  const toggleExecutorCredential = useToggleExecutorSourceCredential();
  const [inviteEmailsInput, setInviteEmailsInput] = useState("");
  const [workspaceNameInput, setWorkspaceNameInput] = useState("");
  const [executorForm, setExecutorForm] = useState<ExecutorSourceFormState>(
    DEFAULT_EXECUTOR_SOURCE_FORM,
  );

  const activeWorkspaceId = data?.owner.ownerId;
  const workspaceOptions = data?.workspaces ?? EMPTY_WORKSPACE_OPTIONS;
  const activeWorkspaceName =
    workspaceOptions.find((workspace) => workspace.id === activeWorkspaceId)?.name ?? "Workspace";
  const { data: membersData, isLoading: membersLoading } = useWorkspaceMembers(activeWorkspaceId);

  const canInviteMembers =
    membersData?.membershipRole === "owner" || membersData?.membershipRole === "admin";
  const canManageExecutorSources =
    executorData?.membershipRole === "owner" || executorData?.membershipRole === "admin";
  const members = membersData?.members ?? [];
  const executorSources = useMemo(() => executorData?.sources ?? [], [executorData?.sources]);
  const parsedInviteEmails = useMemo(
    () =>
      inviteEmailsInput
        .split(/[,\n]/)
        .map((email) => email.trim())
        .filter(Boolean),
    [inviteEmailsInput],
  );
  const nameChanged = workspaceNameInput.trim() !== activeWorkspaceName;

  useEffect(() => {
    setWorkspaceNameInput(activeWorkspaceName);
  }, [activeWorkspaceName]);

  const handleSwitchWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        await switchWorkspace.mutateAsync(workspaceId);
        router.push("/");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to switch workspace.");
      }
    },
    [switchWorkspace, router],
  );

  const handleInviteEmailsChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInviteEmailsInput(event.target.value);
  }, []);

  const handleWorkspaceNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setWorkspaceNameInput(event.target.value);
  }, []);

  const handleRenameSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!activeWorkspaceId) {
        return;
      }

      const trimmedName = workspaceNameInput.trim();
      if (trimmedName.length < 2) {
        toast.error("Workspace name must be at least 2 characters.");
        return;
      }

      try {
        await renameWorkspace.mutateAsync({
          workspaceId: activeWorkspaceId,
          name: trimmedName,
        });
        toast.success("Workspace renamed.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to rename workspace.");
      }
    },
    [activeWorkspaceId, renameWorkspace, workspaceNameInput],
  );

  const handleInviteSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!activeWorkspaceId) {
        return;
      }

      if (parsedInviteEmails.length === 0) {
        toast.error("Enter at least one email address.");
        return;
      }

      try {
        const result = await inviteMembers.mutateAsync({
          workspaceId: activeWorkspaceId,
          emails: parsedInviteEmails,
        });
        const addedCount = result.added.length;
        toast.success(
          addedCount > 0
            ? `Added ${addedCount} member${addedCount === 1 ? "" : "s"}.`
            : "No matching users were added.",
        );
        setInviteEmailsInput("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add members.");
      }
    },
    [activeWorkspaceId, inviteMembers, parsedInviteEmails],
  );

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
        const result = await createExecutorSource.mutateAsync({
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

        if (executorForm.secret.trim()) {
          await setExecutorCredential.mutateAsync({
            workspaceExecutorSourceId: result.id,
            secret: executorForm.secret,
            displayName: executorForm.displayName || null,
            enabled: true,
          });
        }

        setExecutorForm(DEFAULT_EXECUTOR_SOURCE_FORM);
        toast.success("Executor source added.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add executor source.");
      }
    },
    [createExecutorSource, executorForm, setExecutorCredential],
  );

  const handleToggleExecutorSource = useCallback(
    async (sourceId: string, enabled: boolean) => {
      const source = executorSources.find((entry) => entry.id === sourceId);
      if (!source) {
        return;
      }

      try {
        await updateExecutorSource.mutateAsync({
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
    [executorSources, updateExecutorSource],
  );

  const handleSaveExecutorCredential = useCallback(
    async (sourceId: string, secretInput: string, displayNameInput: string) => {
      const secret = secretInput.trim();
      if (!secret) {
        toast.error("Enter a secret first.");
        return;
      }

      try {
        await setExecutorCredential.mutateAsync({
          workspaceExecutorSourceId: sourceId,
          secret,
          displayName: displayNameInput.trim() || null,
          enabled: true,
        });
        toast.success("Credential saved.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save credential.");
      }
    },
    [setExecutorCredential],
  );

  const handleDisconnectExecutorCredential = useCallback(
    async (sourceId: string) => {
      try {
        await disconnectExecutorCredential.mutateAsync(sourceId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to disconnect credential.");
      }
    },
    [disconnectExecutorCredential],
  );

  const handleToggleExecutorCredential = useCallback(
    async (sourceId: string, enabled: boolean) => {
      try {
        await toggleExecutorCredential.mutateAsync({
          workspaceExecutorSourceId: sourceId,
          enabled,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update credential.");
      }
    },
    [toggleExecutorCredential],
  );

  const handleDeleteExecutorSource = useCallback(
    async (sourceId: string) => {
      try {
        await deleteExecutorSource.mutateAsync(sourceId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete executor source.");
      }
    },
    [deleteExecutorSource],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Workspace</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage settings for your active workspace.
        </p>
      </div>

      {clientEditionCapabilities.edition === "cloud" && workspaceOptions.length > 1 && (
        <section className="rounded-lg border p-5">
          <div>
            <h3 className="text-sm font-medium">Your workspaces</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Switch between workspaces you belong to.
            </p>
          </div>

          <div className="mt-4 space-y-2">
            {workspaceOptions.map((ws) => (
              <WorkspaceRow
                key={ws.id}
                name={ws.name}
                role={ws.role ?? "member"}
                isActive={ws.id === activeWorkspaceId}
                isPending={switchWorkspace.isPending}
                onSwitch={handleSwitchWorkspace}
                workspaceId={ws.id}
              />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border p-5">
        <div>
          <h3 className="text-sm font-medium">Workspace name</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Update how this workspace appears across the app.
          </p>
        </div>

        <form onSubmit={handleRenameSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            value={workspaceNameInput}
            onChange={handleWorkspaceNameChange}
            placeholder="Enter workspace name"
            disabled={!canInviteMembers || renameWorkspace.isPending}
          />
          <Button
            type="submit"
            disabled={!canInviteMembers || renameWorkspace.isPending || !nameChanged}
          >
            {renameWorkspace.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save changes"
            )}
          </Button>
        </form>

        {clientEditionCapabilities.hasBilling ? (
          <p className="text-muted-foreground mt-3 text-sm">
            Workspace billing and credit management stay in the Billing and Usage tabs.
          </p>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            This self-hosted deployment keeps one workspace for the whole instance.
          </p>
        )}
      </section>

      <section className="rounded-lg border p-5">
        <div>
          <h3 className="text-sm font-medium">Members</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Review current access for this workspace.
          </p>
        </div>

        {clientEditionCapabilities.edition === "cloud" ? (
          <>
            <form onSubmit={handleInviteSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input
                value={inviteEmailsInput}
                onChange={handleInviteEmailsChange}
                placeholder="alice@example.com, bob@example.com"
                disabled={!canInviteMembers || inviteMembers.isPending}
              />
              <Button type="submit" disabled={!canInviteMembers || inviteMembers.isPending}>
                {inviteMembers.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Add members"
                )}
              </Button>
            </form>

            {!canInviteMembers ? (
              <p className="text-muted-foreground mt-3 text-sm">
                Workspace admin access is required to add members.
              </p>
            ) : (
              <p className="text-muted-foreground mt-3 text-sm">
                Only users with existing accounts can be added right now.
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            New users automatically join this instance workspace after signup.
          </p>
        )}

        <div className="mt-5 space-y-3">
          {membersLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            </div>
          ) : members.length > 0 ? (
            members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between rounded-lg border px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="text-muted-foreground truncate text-sm">{member.email}</p>
                </div>
                <span className="text-muted-foreground text-xs capitalize">{member.role}</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">No members found in this workspace yet.</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border p-5">
        <div>
          <h3 className="text-sm font-medium">Executor Sources</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Shared MCP and OpenAPI sources for this workspace. Definitions are shared, but each
            member connects their own credentials.
          </p>
        </div>

        {executorData?.packageRevisionHash ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Cached package revision: {executorData.packageRevisionHash.slice(0, 12)}
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
              <Button
                type="submit"
                disabled={createExecutorSource.isPending || !canManageExecutorSources}
              >
                {createExecutorSource.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Add source"
                )}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">
            Workspace admin access is required to add or edit shared Executor sources.
          </p>
        )}

        <div className="mt-5 space-y-3">
          {executorLoading ? (
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
                isUpdatingSource={updateExecutorSource.isPending}
                isDeletingSource={deleteExecutorSource.isPending}
                isSavingCredential={setExecutorCredential.isPending}
                isDisconnectingCredential={disconnectExecutorCredential.isPending}
                isTogglingCredential={toggleExecutorCredential.isPending}
                onToggleSource={handleToggleExecutorSource}
                onDeleteSource={handleDeleteExecutorSource}
                onSaveCredential={handleSaveExecutorCredential}
                onDisconnectCredential={handleDisconnectExecutorCredential}
                onToggleCredential={handleToggleExecutorCredential}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
