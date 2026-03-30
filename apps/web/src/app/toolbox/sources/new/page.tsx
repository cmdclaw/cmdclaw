"use client";

import type { ChangeEvent, FormEvent } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type ExecutorSourceFormState,
  DEFAULT_EXECUTOR_SOURCE_FORM,
  ExecutorSourceFields,
  buildMutationInputFromForm,
} from "@/components/executor-source-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useExecutorSourceList,
  useCreateExecutorSource,
  useSetExecutorSourceCredential,
} from "@/orpc/hooks";

function NewSourceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading: listLoading } = useExecutorSourceList();
  const createSource = useCreateExecutorSource();
  const setCredential = useSetExecutorSourceCredential();

  const isWorkspaceAdmin = data?.membershipRole === "admin" || data?.membershipRole === "owner";

  const initialForm = useMemo<ExecutorSourceFormState>(() => {
    const kindParam = searchParams.get("kind");
    const kind = kindParam === "mcp" ? "mcp" : "openapi";
    return {
      ...DEFAULT_EXECUTOR_SOURCE_FORM,
      kind,
      transport: kind === "mcp" ? "streamable-http" : "",
    };
  }, [searchParams]);

  const [form, setForm] = useState<ExecutorSourceFormState>(initialForm);

  const handleFieldChange = useCallback((field: keyof ExecutorSourceFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  }, []);

  const handleSecretChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, secret: event.target.value }));
  }, []);

  const handleDisplayNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, displayName: event.target.value }));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      try {
        const result = await createSource.mutateAsync(buildMutationInputFromForm(form));

        if (form.secret.trim() && result?.id) {
          await setCredential.mutateAsync({
            workspaceExecutorSourceId: result.id,
            secret: form.secret.trim(),
            displayName: form.displayName.trim(),
          });
        }

        toast.success("Source added.");
        router.push(`/toolbox/sources/${result.id}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create source.");
      }
    },
    [createSource, form, router, setCredential],
  );

  if (listLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isWorkspaceAdmin) {
    return (
      <div className="py-24 text-center">
        <p className="text-muted-foreground text-sm">
          You need workspace admin access to add sources.
        </p>
        <Link href="/toolbox" className="text-brand mt-4 inline-block text-sm hover:underline">
          Back to Toolbox
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/toolbox"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Toolbox
      </Link>

      <h1 className="mb-6 text-xl font-semibold">
        {form.kind === "mcp" ? "Add MCP Server" : "Add OpenAPI Source"}
      </h1>

      <form onSubmit={handleSubmit} className="bg-card rounded-lg border p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <ExecutorSourceFields
            form={form}
            formIdPrefix="new-source"
            onFieldChange={handleFieldChange}
          />

          {form.authType !== "none" && form.authType !== "oauth2" && (
            <>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="new-source-secret" className="text-sm font-medium">
                  Credential secret
                </label>
                <Input
                  id="new-source-secret"
                  value={form.secret}
                  onChange={handleSecretChange}
                  placeholder="Your API key or token (optional, can add later)"
                  type="password"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="new-source-display-name" className="text-sm font-medium">
                  Credential label
                </label>
                <Input
                  id="new-source-display-name"
                  value={form.displayName}
                  onChange={handleDisplayNameChange}
                  placeholder="Label for your credential (optional)"
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="ghost" asChild>
            <Link href="/toolbox">Cancel</Link>
          </Button>
          <Button type="submit" disabled={createSource.isPending}>
            {createSource.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add source
          </Button>
        </div>
      </form>
    </div>
  );
}

const suspenseFallback = (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
  </div>
);

export default function NewSourcePage() {
  return (
    <Suspense fallback={suspenseFallback}>
      <NewSourceContent />
    </Suspense>
  );
}
