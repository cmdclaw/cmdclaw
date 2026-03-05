import { AppShell } from "@/components/app-shell";

export default function SearchPage() {
  return (
    <AppShell>
      <div className="bg-background min-h-screen">
        <div className="mx-auto w-full max-w-4xl px-6 py-10">
          <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Search across workflows, skills, and integrations.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
