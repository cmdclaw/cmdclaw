"use client";

import { CircleHelp, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useChatAdvancedSettingsStore } from "@/components/chat/chat-advanced-settings-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useAddApprovedLoginEmailAllowlistEntry,
  useAddGoogleAccessAllowlistEntry,
  useApprovedLoginEmailAllowlist,
  useGoogleAccessAllowlist,
  useRemoveApprovedLoginEmailAllowlistEntry,
  useRemoveGoogleAccessAllowlistEntry,
  useResetOnboarding,
} from "@/orpc/hooks";

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default function AdminPage() {
  const router = useRouter();
  const {
    data: approvedLoginData,
    isLoading: isApprovedLoginLoading,
    error: approvedLoginError,
  } = useApprovedLoginEmailAllowlist();
  const { data, isLoading, error } = useGoogleAccessAllowlist();
  const addApprovedLoginEntry = useAddApprovedLoginEmailAllowlistEntry();
  const addEntry = useAddGoogleAccessAllowlistEntry();
  const removeApprovedLoginEntry = useRemoveApprovedLoginEmailAllowlistEntry();
  const removeEntry = useRemoveGoogleAccessAllowlistEntry();
  const resetOnboarding = useResetOnboarding();
  const displayAdvancedMetrics = useChatAdvancedSettingsStore(
    (state) => state.displayAdvancedMetrics,
  );
  const setDisplayAdvancedMetrics = useChatAdvancedSettingsStore(
    (state) => state.setDisplayAdvancedMetrics,
  );

  const [approvedLoginEmail, setApprovedLoginEmail] = useState("");
  const [email, setEmail] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const approvedLoginEntries = useMemo(
    () => (Array.isArray(approvedLoginData) ? approvedLoginData : []),
    [approvedLoginData],
  );
  const entries = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const handleApprovedLoginEmailChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setApprovedLoginEmail(event.target.value);
    },
    [],
  );

  const handleEmailChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
  }, []);

  const handleAddApprovedLogin = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setActionMessage(null);
      setActionError(null);

      const normalizedEmail = approvedLoginEmail.trim().toLowerCase();
      if (!normalizedEmail) {
        setActionError("Approved email is required.");
        return;
      }

      try {
        await addApprovedLoginEntry.mutateAsync({ email: normalizedEmail });
        setActionMessage("Approved login email added.");
        setApprovedLoginEmail("");
      } catch (err) {
        setActionError(toErrorMessage(err, "Failed to add approved login email."));
      }
    },
    [addApprovedLoginEntry, approvedLoginEmail],
  );

  const handleAdd = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setActionMessage(null);
      setActionError(null);

      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        setActionError("Email is required.");
        return;
      }

      try {
        await addEntry.mutateAsync({ email: normalizedEmail });
        setActionMessage("Google access granted.");
        setEmail("");
      } catch (err) {
        setActionError(toErrorMessage(err, "Failed to grant Google access."));
      }
    },
    [addEntry, email],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      setActionMessage(null);
      setActionError(null);
      try {
        await removeEntry.mutateAsync({ id });
        setActionMessage("Google access removed.");
      } catch (err) {
        setActionError(toErrorMessage(err, "Failed to remove Google access."));
      }
    },
    [removeEntry],
  );

  const handleRemoveClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.allowlistId;
      if (!id) {
        return;
      }
      void handleRemove(id);
    },
    [handleRemove],
  );

  const handleRemoveApprovedLogin = useCallback(
    async (id: string) => {
      setActionMessage(null);
      setActionError(null);
      try {
        await removeApprovedLoginEntry.mutateAsync({ id });
        setActionMessage("Approved login email removed.");
      } catch (err) {
        setActionError(toErrorMessage(err, "Failed to remove approved login email."));
      }
    },
    [removeApprovedLoginEntry],
  );

  const handleRemoveApprovedLoginClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const id = event.currentTarget.dataset.approvedLoginId;
      if (!id) {
        return;
      }
      void handleRemoveApprovedLogin(id);
    },
    [handleRemoveApprovedLogin],
  );

  const handleResetOnboarding = useCallback(async () => {
    setActionMessage(null);
    setActionError(null);

    try {
      await resetOnboarding.mutateAsync();
      router.push("/onboarding/subscriptions");
    } catch (err) {
      setActionError(toErrorMessage(err, "Failed to reset onboarding."));
    }
  }, [resetOnboarding, router]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Admin Settings</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage which users can connect Google integrations.
        </p>
      </div>

      {(actionError || actionMessage) && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            actionError
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
          }`}
        >
          {actionError ?? actionMessage}
        </div>
      )}

      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-base font-semibold">Approved Login Emails</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          Only these emails can log in. Add people here to approve access for this invite-only app.
        </p>

        <form onSubmit={handleAddApprovedLogin} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            placeholder="user@company.com"
            value={approvedLoginEmail}
            onChange={handleApprovedLoginEmailChange}
            className="sm:max-w-sm"
          />
          <Button type="submit" disabled={addApprovedLoginEntry.isPending}>
            {addApprovedLoginEntry.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add approved email"
            )}
          </Button>
        </form>

        {isApprovedLoginLoading ? (
          <div className="mt-6 flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        ) : approvedLoginError ? (
          <p className="text-destructive mt-4 text-sm">Failed to load approved login emails.</p>
        ) : approvedLoginEntries.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">No approved login emails configured.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">Added At</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {approvedLoginEntries.map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="px-3 py-2">{entry.email}</td>
                    <td className="text-muted-foreground px-3 py-2">
                      {entry.isBuiltIn ? "Built-in admin" : "Admin added"}
                    </td>
                    <td className="text-muted-foreground px-3 py-2">
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Always"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        data-approved-login-id={entry.id}
                        onClick={handleRemoveApprovedLoginClick}
                        disabled={entry.isBuiltIn || removeApprovedLoginEntry.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-card mt-6 rounded-lg border p-6">
        <h3 className="text-base font-semibold">Google Access Allowlist</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          Users not on this list cannot connect Gmail, Google Calendar, Docs, Sheets, or Drive.
        </p>

        <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            placeholder="user@company.com"
            value={email}
            onChange={handleEmailChange}
            className="sm:max-w-sm"
          />
          <Button type="submit" disabled={addEntry.isPending}>
            {addEntry.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              "Add user"
            )}
          </Button>
        </form>

        {isLoading ? (
          <div className="mt-6 flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-destructive mt-4 text-sm">Failed to load allowlist.</p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">No users have Google access yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Added At</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="px-3 py-2">{entry.email}</td>
                    <td className="text-muted-foreground px-3 py-2">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        data-allowlist-id={entry.id}
                        onClick={handleRemoveClick}
                        disabled={removeEntry.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-card mt-6 rounded-lg border p-6">
        <h3 className="text-base font-semibold">Onboarding</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          Clear your onboarding status and jump back into the onboarding flow from the start.
        </p>

        <div className="mt-4 rounded-lg border p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Reset current user onboarding</p>
              <p className="text-muted-foreground text-sm">
                Use this to re-run the onboarding experience on your current account.
              </p>
            </div>
            <Button onClick={handleResetOnboarding} disabled={resetOnboarding.isPending}>
              {resetOnboarding.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset my onboarding"
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card mt-6 rounded-lg border p-6">
        <h3 className="text-base font-semibold">Advanced Settings</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          Configure optional diagnostics and power-user controls.
        </p>

        <div className="mt-4 rounded-lg border p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label htmlFor="display-advanced-metrics" className="text-sm font-medium">
                  Nerd mode
                </label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="What advanced metrics show"
                      className="text-muted-foreground hover:text-foreground inline-flex"
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Shows generation timing chips in chat and includes those metrics when you copy a
                    chat transcript.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-muted-foreground text-sm">
                Enable to show performance timings like generation and first-event wait.
              </p>
            </div>
            <Switch
              id="display-advanced-metrics"
              checked={displayAdvancedMetrics}
              onCheckedChange={setDisplayAdvancedMetrics}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
