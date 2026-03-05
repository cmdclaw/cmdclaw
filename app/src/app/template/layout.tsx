import { AppShell } from "@/components/app-shell";

export default function TemplateLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="bg-background min-h-screen">
        <div className="mx-auto w-full max-w-[1500px] px-6 py-6">
          <main>{children}</main>
        </div>
      </div>
    </AppShell>
  );
}
