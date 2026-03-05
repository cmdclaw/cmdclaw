"use client";

import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ChatCopyButton } from "@/components/chat/chat-copy-button";
import { ChatShareControls } from "@/components/chat/chat-share-controls";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useCurrentUser, useSetUserTimezone } from "@/orpc/hooks";

const CHAT_CONVERSATION_ID_SYNC_EVENT = "chat:conversation-id-sync";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useIsAdmin();
  const params = useParams();
  const routeConversationId = params?.conversationId as string | undefined;
  const [liveConversationId, setLiveConversationId] = useState<string | undefined>(
    routeConversationId,
  );
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const setTimezoneMutation = useSetUserTimezone();
  const lastTimezoneSyncRef = useRef<string | null>(null);

  useEffect(() => {
    setLiveConversationId(routeConversationId);
  }, [routeConversationId]);

  useEffect(() => {
    const handleConversationIdSync = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (detail?.conversationId) {
        setLiveConversationId(detail.conversationId);
      }
    };

    window.addEventListener(CHAT_CONVERSATION_ID_SYNC_EVENT, handleConversationIdSync);
    return () =>
      window.removeEventListener(CHAT_CONVERSATION_ID_SYNC_EVENT, handleConversationIdSync);
  }, []);

  useEffect(() => {
    if (!userLoading && user && !user.onboardedAt) {
      router.replace("/onboarding/integrations");
    }
  }, [user, userLoading, router]);

  useEffect(() => {
    if (userLoading || !user) {
      return;
    }

    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTimezone || user.timezone) {
      return;
    }

    if (setTimezoneMutation.isPending || lastTimezoneSyncRef.current === browserTimezone) {
      return;
    }

    lastTimezoneSyncRef.current = browserTimezone;
    setTimezoneMutation.mutate(browserTimezone, {
      onError: () => {
        lastTimezoneSyncRef.current = null;
      },
    });
  }, [userLoading, user, setTimezoneMutation]);

  // Show loading while checking onboarding status
  if (userLoading || (user && !user.onboardedAt)) {
    return (
      <div className="bg-background flex h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <AppShell>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <span className="text-sm font-medium">Chat</span>
        {isAdmin && liveConversationId && (
          <span className="text-muted-foreground font-mono text-xs">ID: {liveConversationId}</span>
        )}
        <ChatCopyButton conversationId={liveConversationId} className="ml-auto" />
        <ChatShareControls conversationId={liveConversationId} />
      </header>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">{children}</div>
    </AppShell>
  );
}
