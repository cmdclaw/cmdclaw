"use client";

import type { ChangeEvent, FormEvent } from "react";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type ExecutorSourceFormState,
  type ExecutorSourceListItem,
  ExecutorSourceFields,
  buildMutationInputFromForm,
  getSourceFormState,
} from "@/components/executor-source-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useExecutorSourceList,
  useUpdateExecutorSource,
  useDeleteExecutorSource,
  useSetExecutorSourceCredential,
  useDisconnectExecutorSourceCredential,
  useToggleExecutorSourceCredential,
} from "@/orpc/hooks";

function SourceDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading } = useExecutorSourceList();
  const updateSource = useUpdateExecutorSource();
  const deleteSource = useDeleteExecutorSource();
  const setCredential = useSetExecutorSourceCredential();
  const disconnectCredential = useDisconnectExecutorSourceCredential();
  const toggleCredential = useToggleExecutorSourceCredential();

  const isWorkspaceAdmin = data?.membershipRole === "admin" || data?.membershipRole === "owner";
  const source = useMemo(
    () => data?.sources?.find((s: ExecutorSourceListItem) => s.id === id) ?? null,
    [data?.sources, id],
  );

  const [editForm, setEditForm] = useState<ExecutorSourceFormState | null>(null);
  const [secret, setSecret] = useState("");
  const [credDisplayName, setCredDisplayName] = useState("");

  const handleSecretChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSecret(e.target.value);
  }, []);

  const handleCredDisplayNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setCredDisplayName(e.target.value);
  }, []);

  useEffect(() => {
    if (source) {
      setCredDisplayName(source.credentialDisplayName ?? "");
    }
  }, [source]);

  const handleEditFieldChange = useCallback(
    (field: keyof ExecutorSourceFormState, value: string) => {
      setEditForm((current) => (current ? { ...current, [field]: value } : current));
    },
    [],
  );

  const handleStartEdit = useCallback(() => {
    if (source) {
      setEditForm(getSourceFormState(source));
    }
  }, [source]);

  const handleCancelEdit = useCallback(() => {
    setEditForm(null);
  }, []);

  const handleSaveEdit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!source || !editForm) {
        return;
      }

      try {
        await updateSource.mutateAsync({
          id: source.id,
          ...buildMutationInputFromForm(editForm),
          enabled: source.enabled,
        });
        setEditForm(null);
        toast.success("Source updated.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update source.");
      }
    },
    [editForm, source, updateSource],
  );

  const handleToggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (!source) {
        return;
      }
      try {
        await updateSource.mutateAsync({
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
        toast.error(error instanceof Error ? error.message : "Failed to toggle source.");
      }
    },
    [source, updateSource],
  );

  const handleDelete = useCallback(async () => {
    if (!source) {
      return;
    }
    if (!confirm(`Delete "${source.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteSource.mutateAsync(source.id);
      toast.success("Source deleted.");
      router.push("/toolbox");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete source.");
    }
  }, [deleteSource, router, source]);

  const handleSaveCredential = useCallback(async () => {
    if (!source) {
      return;
    }
    const trimmedSecret = secret.trim();
    if (!trimmedSecret) {
      toast.error("Enter a secret first.");
      return;
    }
    try {
      await setCredential.mutateAsync({
        workspaceExecutorSourceId: source.id,
        secret: trimmedSecret,
        displayName: credDisplayName.trim(),
      });
      setSecret("");
      toast.success("Credential saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save credential.");
    }
  }, [credDisplayName, secret, setCredential, source]);

  const handleDisconnectCredential = useCallback(async () => {
    if (!source) {
      return;
    }
    try {
      await disconnectCredential.mutateAsync(source.id);
      toast.success("Credential disconnected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect credential.");
    }
  }, [disconnectCredential, source]);

  const handleToggleCredential = useCallback(
    async (enabled: boolean) => {
      if (!source) {
        return;
      }
      try {
        await toggleCredential.mutateAsync({
          workspaceExecutorSourceId: source.id,
          enabled,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update credential.");
      }
    },
    [source, toggleCredential],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!source) {
    return (
      <div className="py-24 text-center">
        <p className="text-muted-foreground text-sm">Source not found.</p>
        <Link href="/toolbox" className="text-brand mt-4 inline-block text-sm hover:underline">
          Back to Toolbox
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/toolbox"
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Toolbox
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{source.name}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {source.namespace} · {source.kind === "openapi" ? "OpenAPI" : "MCP"} ·{" "}
              {source.endpoint}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isWorkspaceAdmin && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Enabled</span>
                <Switch
                  checked={source.enabled}
                  disabled={updateSource.isPending}
                  onCheckedChange={handleToggleEnabled}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Source configuration (admin only) */}
      {isWorkspaceAdmin && (
        <section className="bg-card mb-6 rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Configuration</h2>
            <div className="flex items-center gap-2">
              {editForm ? (
                <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                  Cancel
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={handleStartEdit}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleteSource.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>

          {editForm ? (
            <form onSubmit={handleSaveEdit} className="mt-4 grid gap-3 md:grid-cols-2">
              <ExecutorSourceFields
                form={editForm}
                formIdPrefix={`source-edit-${source.id}`}
                onFieldChange={handleEditFieldChange}
              />
              <div className="flex justify-end gap-2 md:col-span-2">
                <Button type="submit" disabled={updateSource.isPending}>
                  {updateSource.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="text-muted-foreground mt-3 space-y-1 text-sm">
              <p>Kind: {source.kind === "openapi" ? "OpenAPI" : "Remote MCP"}</p>
              <p>Endpoint: {source.endpoint}</p>
              {source.specUrl && <p>Spec URL: {source.specUrl}</p>}
              {source.transport && <p>Transport: {source.transport}</p>}
              <p>
                Auth:{" "}
                {source.authType === "none"
                  ? "None"
                  : source.authType === "bearer"
                    ? "Bearer token"
                    : "API key"}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Credential section (all users) */}
      <section className="bg-card rounded-lg border p-6">
        <h2 className="text-sm font-semibold">Your Credential</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          {source.authType === "none"
            ? "This source does not require authentication."
            : source.connected
              ? "Your credential is connected. You can update or disconnect it."
              : "Connect your personal credential to use this source."}
        </p>

        {source.authType !== "none" && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <Input
                value={secret}
                onChange={handleSecretChange}
                placeholder={source.connected ? "Update your secret" : "Your API key or token"}
                type="password"
              />
              <Input
                value={credDisplayName}
                onChange={handleCredDisplayNameChange}
                placeholder="Label (optional)"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleSaveCredential}
                disabled={setCredential.isPending}
              >
                {setCredential.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {source.connected ? "Update secret" : "Connect"}
              </Button>

              {source.connected && (
                <>
                  <Button
                    variant="ghost"
                    onClick={handleDisconnectCredential}
                    disabled={disconnectCredential.isPending}
                  >
                    Disconnect
                  </Button>

                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Credential active</span>
                    <Switch
                      checked={source.credentialEnabled}
                      disabled={toggleCredential.isPending}
                      onCheckedChange={handleToggleCredential}
                    />
                  </div>
                </>
              )}
            </div>

            {source.connected && (
              <p className="text-muted-foreground text-xs">
                Status:{" "}
                <span
                  className={
                    source.credentialEnabled
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {source.credentialEnabled ? "Active" : "Paused"}
                </span>
                {source.credentialDisplayName && ` · ${source.credentialDisplayName}`}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const suspenseFallback = (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
  </div>
);

export default function SourceDetailPage() {
  return (
    <Suspense fallback={suspenseFallback}>
      <SourceDetailContent />
    </Suspense>
  );
}
