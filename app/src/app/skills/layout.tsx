"use client";

export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto w-full max-w-[1400px] px-8 pt-10 pb-16">{children}</main>
    </div>
  );
}
