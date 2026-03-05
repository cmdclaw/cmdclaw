import { AppShell } from "@/components/app-shell";

export default function TemplatesPage() {
  return (
    <AppShell>
      <div className="bg-background min-h-screen">
        <div className="mx-auto w-full max-w-[1500px] px-6 py-10">
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Browse workflow templates to get started quickly.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
