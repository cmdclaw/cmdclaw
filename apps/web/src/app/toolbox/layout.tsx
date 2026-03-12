"use client";

export default function ToolboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto w-full max-w-[1400px] px-4 pt-4 pb-16 sm:px-8 sm:pt-10">
        {children}
      </main>
    </div>
  );
}
