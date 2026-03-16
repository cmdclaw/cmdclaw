"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  clearPendingCoworkerPrompt,
  readPendingCoworkerPrompt,
} from "@/components/landing/pending-coworker-prompt";
import { COWORKER_AVAILABLE_INTEGRATION_TYPES } from "@/lib/integration-icons";
import { client } from "@/orpc/client";
import { useCreateCoworker } from "@/orpc/hooks";

const DEFAULT_COWORKER_BUILDER_MODEL = "anthropic/claude-sonnet-4-6";

export default function NewCoworkerPage() {
  const router = useRouter();
  const createCoworker = useCreateCoworker();
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    const pendingPrompt = readPendingCoworkerPrompt();
    if (!pendingPrompt) {
      router.replace("/");
      return;
    }

    hasStartedRef.current = true;

    void (async () => {
      try {
        const result = await createCoworker.mutateAsync({
          name: "",
          triggerType: "manual",
          prompt: "",
          model: DEFAULT_COWORKER_BUILDER_MODEL,
          allowedIntegrations: COWORKER_AVAILABLE_INTEGRATION_TYPES,
        });

        try {
          const { conversationId } = await client.coworker.getOrCreateBuilderConversation({
            id: result.id,
          });
          await client.generation.startGeneration({
            conversationId,
            content: pendingPrompt,
            model: DEFAULT_COWORKER_BUILDER_MODEL,
            autoApprove: true,
          });
        } catch (error) {
          console.error("Failed to start coworker builder generation:", error);
        }

        clearPendingCoworkerPrompt();
        window.location.assign(`/coworkers/${result.id}`);
      } catch (error) {
        console.error("Failed to resume coworker builder creation:", error);
        clearPendingCoworkerPrompt();
        router.replace("/");
      }
    })();
  }, [createCoworker, router]);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        <p className="text-muted-foreground text-sm">Preparing your coworker builder...</p>
      </div>
    </div>
  );
}
