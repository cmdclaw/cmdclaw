"use client";

import { useSearchParams } from "next/navigation";
import { use, useEffect, useMemo } from "react";
import { ChatArea } from "@/components/chat/chat-area";
import { client } from "@/orpc/client";

type Props = {
  params: Promise<{ conversationId: string }>;
};

export default function ConversationPage({ params }: Props) {
  const { conversationId } = use(params);
  const searchParams = useSearchParams();
  const authComplete = searchParams.get("auth_complete");
  const interruptId = searchParams.get("interrupt_id");
  const authCompletion = useMemo(
    () => (authComplete && interruptId ? { integration: authComplete, interruptId } : null),
    [authComplete, interruptId],
  );

  // Handle OAuth callback
  useEffect(() => {
    if (authComplete && interruptId) {
      // Notify server that auth is complete
      client.generation
        .submitAuthResult({
          interruptId,
          integration: authComplete,
          success: true,
        })
        .then(() => {
          // Clear URL params
          window.history.replaceState({}, "", `/chat/${conversationId}`);
        })
        .catch((err) => {
          console.error("Failed to submit auth result:", err);
        });
    }
  }, [authComplete, conversationId, interruptId]);

  return <ChatArea conversationId={conversationId} authCompletion={authCompletion} />;
}
