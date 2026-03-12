"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { BugReportForm } from "@/components/bug-report-form";

export default function BugReportPage() {
  const router = useRouter();

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-xl flex-col px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="text-muted-foreground hover:text-foreground -ml-1 rounded-full p-1 transition-colors"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold">Bug report</h1>
          <p className="text-muted-foreground text-sm">Send a message to the CmdClaw team.</p>
        </div>
      </div>
      <BugReportForm onSuccess={handleBack} />
    </div>
  );
}
