"use client";

import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { Building2, Loader2, Pencil, Plus, Search, UserPlus, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useAdminAddWorkspaceMembers,
  useAdminCreateWorkspace,
  useAdminJoinWorkspace,
  useAdminRemoveWorkspaceMember,
  useAdminRenameWorkspace,
  useAdminWorkspaces,
  useBillingOverview,
} from "@/orpc/hooks";

type WorkspaceMember = {
  email: string;
  name: string;
  role: string;
};

type WorkspaceData = {
  id: string;
  name: string;
  slug: string | null;
  billingPlanId: string;
  createdAt: string | Date | null;
  members: WorkspaceMember[];
};

function formatDate(value: string | Date | null | undefined): string {
  if (!value) {
    return "N/A";
  }
  return new Date(value).toLocaleDateString();
}

function MemberRow({
  member,
  workspaceId,
  onRemove,
  isRemoving,
}: {
  member: WorkspaceMember;
  workspaceId: string;
  onRemove: (workspaceId: string, email: string) => void;
  isRemoving: boolean;
}) {
  const handleRemove = useCallback(() => {
    onRemove(workspaceId, member.email);
  }, [onRemove, workspaceId, member.email]);

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground text-xs">
        {member.email}
        <span className="ml-1 opacity-50">({member.role})</span>
      </span>
      <button
        type="button"
        onClick={handleRemove}
        disabled={isRemoving}
        className="text-muted-foreground hover:text-destructive ml-2 shrink-0 rounded p-0.5 transition-colors disabled:opacity-50"
        title={`Remove ${member.email}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function AddMembersForm({
  workspaceId,
  onAdd,
  isAdding,
}: {
  workspaceId: string;
  onAdd: (workspaceId: string, emails: string[]) => void;
  isAdding: boolean;
}) {
  const [input, setInput] = useState("");

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const emails = input
        .split(/[,\n]/)
        .map((e) => e.trim())
        .filter(Boolean);
      if (emails.length === 0) {
        return;
      }
      onAdd(workspaceId, emails);
      setInput("");
    },
    [input, onAdd, workspaceId],
  );

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
      <Input
        value={input}
        onChange={handleChange}
        placeholder="Add emails (comma-separated)"
        className="h-7 text-xs"
        disabled={isAdding}
      />
      <Button type="submit" variant="outline" size="sm" disabled={isAdding || !input.trim()}>
        {isAdding ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
      </Button>
    </form>
  );
}

function CreateWorkspaceForm({
  onCreate,
  isCreating,
}: {
  onCreate: (name: string, ownerEmail: string) => void;
  isCreating: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  }, []);

  const handleEmailChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      if (trimmedName.length < 2 || !trimmedEmail) {
        return;
      }
      onCreate(trimmedName, trimmedEmail);
      setName("");
      setEmail("");
    },
    [name, email, onCreate],
  );

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <Input
        value={name}
        onChange={handleNameChange}
        placeholder="Workspace name"
        className="h-8 max-w-48 text-sm"
        disabled={isCreating}
      />
      <Input
        value={email}
        onChange={handleEmailChange}
        placeholder="Owner email"
        type="email"
        className="h-8 max-w-56 text-sm"
        disabled={isCreating}
      />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={isCreating || name.trim().length < 2 || !email.trim()}
      >
        {isCreating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create
          </>
        )}
      </Button>
    </form>
  );
}

function EditableName({
  workspaceId,
  name,
  onRename,
  isRenaming,
}: {
  workspaceId: string;
  name: string;
  onRename: (workspaceId: string, name: string) => void;
  isRenaming: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    setValue(name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [name]);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name && trimmed.length >= 2) {
      onRename(workspaceId, trimmed);
    }
    setEditing(false);
  }, [value, name, workspaceId, onRename]);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        submit();
      } else if (event.key === "Escape") {
        setEditing(false);
      }
    },
    [submit],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onBlur={submit}
        onKeyDown={handleKeyDown}
        disabled={isRenaming}
        className="focus:border-foreground/30 truncate border-b border-transparent bg-transparent text-sm font-medium outline-none"
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="group flex items-center gap-1 truncate text-sm font-medium hover:underline"
      title="Click to rename"
    >
      {name}
      <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" />
    </button>
  );
}

function WorkspaceCard({
  workspace,
  isMember,
  onJoin,
  isJoining,
  onRemoveMember,
  isRemoving,
  onAddMembers,
  isAdding,
  onRename,
  isRenaming,
}: {
  workspace: WorkspaceData;
  isMember: boolean;
  onJoin: (workspaceId: string) => void;
  isJoining: boolean;
  onRemoveMember: (workspaceId: string, email: string) => void;
  isRemoving: boolean;
  onAddMembers: (workspaceId: string, emails: string[]) => void;
  isAdding: boolean;
  onRename: (workspaceId: string, name: string) => void;
  isRenaming: boolean;
}) {
  const handleJoin = useCallback(() => {
    onJoin(workspace.id);
  }, [onJoin, workspace.id]);

  return (
    <div className="rounded-lg border px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <EditableName
              workspaceId={workspace.id}
              name={workspace.name}
              onRename={onRename}
              isRenaming={isRenaming}
            />
            <span className="text-muted-foreground bg-muted/60 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
              {workspace.billingPlanId}
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-3 text-xs">
            {workspace.slug ? <span>{workspace.slug}</span> : null}
            <span>
              {workspace.members.length} member{workspace.members.length === 1 ? "" : "s"}
            </span>
            <span>Created {formatDate(workspace.createdAt)}</span>
          </div>
        </div>
        <div className="ml-4 shrink-0">
          {isMember ? (
            <span className="text-muted-foreground text-xs font-medium">Joined</span>
          ) : (
            <Button variant="outline" size="sm" disabled={isJoining} onClick={handleJoin}>
              {isJoining ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Join
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {workspace.members.length > 0 ? (
        <div className="mt-2 space-y-0.5">
          {workspace.members.map((member) => (
            <MemberRow
              key={member.email}
              member={member}
              workspaceId={workspace.id}
              onRemove={onRemoveMember}
              isRemoving={isRemoving}
            />
          ))}
        </div>
      ) : null}

      <AddMembersForm workspaceId={workspace.id} onAdd={onAddMembers} isAdding={isAdding} />
    </div>
  );
}

export default function AdminWorkspacesPage() {
  const { data: workspacesData, isLoading } = useAdminWorkspaces();
  const { data: billingOverview } = useBillingOverview();
  const joinWorkspace = useAdminJoinWorkspace();
  const addMembers = useAdminAddWorkspaceMembers();
  const removeMember = useAdminRemoveWorkspaceMember();
  const renameWorkspace = useAdminRenameWorkspace();
  const createWorkspace = useAdminCreateWorkspace();
  const [search, setSearch] = useState("");

  const myWorkspaceIds = useMemo(() => {
    if (!billingOverview?.workspaces) {
      return new Set<string>();
    }
    return new Set(billingOverview.workspaces.map((ws) => ws.id));
  }, [billingOverview?.workspaces]);

  const filteredWorkspaces = useMemo(() => {
    if (!workspacesData) {
      return [];
    }
    const query = search.trim().toLowerCase();
    if (!query) {
      return workspacesData;
    }
    return workspacesData.filter(
      (ws) =>
        ws.name.toLowerCase().includes(query) ||
        (ws.slug && ws.slug.toLowerCase().includes(query)) ||
        ws.members.some((m) => m.email.toLowerCase().includes(query)),
    );
  }, [workspacesData, search]);

  const handleSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  }, []);

  const handleJoin = useCallback(
    async (workspaceId: string) => {
      try {
        const ws = await joinWorkspace.mutateAsync({ workspaceId });
        toast.success(`Joined "${ws.name}" as admin and switched to it.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to join workspace.");
      }
    },
    [joinWorkspace],
  );

  const handleAddMembers = useCallback(
    async (workspaceId: string, emails: string[]) => {
      try {
        const result = await addMembers.mutateAsync({ workspaceId, emails });
        const count = result.added.length;
        toast.success(
          count > 0
            ? `Added ${count} member${count === 1 ? "" : "s"}.`
            : "No matching users were added (they may not have accounts yet).",
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add members.");
      }
    },
    [addMembers],
  );

  const handleCreate = useCallback(
    async (name: string, ownerEmail: string) => {
      try {
        const ws = await createWorkspace.mutateAsync({ name, ownerEmail });
        toast.success(`Created workspace "${ws.name}".`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create workspace.");
      }
    },
    [createWorkspace],
  );

  const handleRename = useCallback(
    async (workspaceId: string, name: string) => {
      try {
        await renameWorkspace.mutateAsync({ workspaceId, name });
        toast.success(`Workspace renamed to "${name}".`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to rename workspace.");
      }
    },
    [renameWorkspace],
  );

  const handleRemoveMember = useCallback(
    async (workspaceId: string, email: string) => {
      try {
        await removeMember.mutateAsync({ workspaceId, email });
        toast.success(`Removed ${email} from workspace.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove member.");
      }
    },
    [removeMember],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Workspaces</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Browse all workspaces. Add or remove members to manage access.
        </p>
      </div>

      <CreateWorkspaceForm onCreate={handleCreate} isCreating={createWorkspace.isPending} />

      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={handleSearchChange}
          placeholder="Filter by name, slug, or member email"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      ) : filteredWorkspaces.length === 0 ? (
        <div className="border-border/60 bg-muted/20 rounded-lg border p-8 text-center">
          <Building2 className="text-muted-foreground mx-auto h-6 w-6" />
          <p className="mt-3 text-sm font-medium">
            {search ? "No workspaces match your search" : "No workspaces found"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredWorkspaces.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              isMember={myWorkspaceIds.has(ws.id)}
              onJoin={handleJoin}
              isJoining={joinWorkspace.isPending}
              onRemoveMember={handleRemoveMember}
              isRemoving={removeMember.isPending}
              onAddMembers={handleAddMembers}
              isAdding={addMembers.isPending}
              onRename={handleRename}
              isRenaming={renameWorkspace.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
