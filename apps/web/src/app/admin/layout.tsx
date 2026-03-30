"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { clientEditionCapabilities } from "@/lib/edition";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAdmin, isLoading } = useIsAdmin();

  useEffect(() => {
    if (!clientEditionCapabilities.hasSupportAdmin) {
      router.replace("/instance");
    }
  }, [router]);

  if (!clientEditionCapabilities.hasSupportAdmin) {
    return (
      <div className="bg-background min-h-full">
        <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-10 md:px-6 md:pt-10">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-full">
      <main className="mx-auto w-full max-w-4xl px-4 pt-8 pb-10 md:px-6 md:pt-10">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : !isAdmin ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
            You do not have access to this section.
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
