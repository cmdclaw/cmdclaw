import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@cmdclaw/db/client";
import { conversation, conversationRuntime, generation } from "@cmdclaw/db/schema";

type ConversationRuntimeRecord = typeof conversationRuntime.$inferSelect;

type BindRuntimeToGenerationResult = {
  runtimeId: string;
  callbackToken: string;
  turnSeq: number;
};

type RuntimeStatus = "active" | "recycled" | "dead";

export type AuthorizedRuntimeContext =
  | {
      ok: true;
      runtimeId: string;
      conversationId: string;
      generationId: string;
      userId: string;
      turnSeq: number;
    }
  | { ok: false; reason: "invalid_token" | "runtime_not_found" | "runtime_not_active" | "stale_turn" };

export const conversationRuntimeService = {
  async getRuntimeForConversation(conversationId: string): Promise<ConversationRuntimeRecord | null> {
    return (
      (await db.query.conversationRuntime.findFirst({
        where: eq(conversationRuntime.conversationId, conversationId),
      })) ?? null
    );
  },

  async getRuntime(runtimeId: string): Promise<ConversationRuntimeRecord | null> {
    return (
      (await db.query.conversationRuntime.findFirst({
        where: eq(conversationRuntime.id, runtimeId),
      })) ?? null
    );
  },

  async bindGenerationToRuntime(params: {
    conversationId: string;
    generationId: string;
  }): Promise<BindRuntimeToGenerationResult> {
    return await db.transaction(async (tx) => {
      await tx
        .insert(conversationRuntime)
        .values({
          conversationId: params.conversationId,
          callbackToken: crypto.randomUUID(),
          status: "active",
          activeTurnSeq: 0,
        })
        .onConflictDoNothing({
          target: conversationRuntime.conversationId,
        });

      const updatedRows = await tx
        .update(conversationRuntime)
        .set({
          activeGenerationId: params.generationId,
          activeTurnSeq: sql`${conversationRuntime.activeTurnSeq} + 1`,
          status: "active",
          lastBoundAt: new Date(),
        })
        .where(eq(conversationRuntime.conversationId, params.conversationId))
        .returning({
          id: conversationRuntime.id,
          callbackToken: conversationRuntime.callbackToken,
          activeTurnSeq: conversationRuntime.activeTurnSeq,
        });
      const updatedRuntime = updatedRows[0];

      if (!updatedRuntime) {
        throw new Error(
          `Failed to bind runtime for conversation ${params.conversationId} to generation ${params.generationId}`,
        );
      }

      await tx
        .update(generation)
        .set({
          runtimeId: updatedRuntime.id,
        })
        .where(eq(generation.id, params.generationId));

      return {
        runtimeId: updatedRuntime.id,
        callbackToken: updatedRuntime.callbackToken,
        turnSeq: updatedRuntime.activeTurnSeq,
      };
    });
  },

  async updateRuntimeSession(params: {
    runtimeId: string;
    sandboxId?: string | null;
    sessionId?: string | null;
    sandboxProvider?: string | null;
    runtimeHarness?: string | null;
    runtimeProtocolVersion?: string | null;
    status?: RuntimeStatus;
  }): Promise<void> {
    await db
      .update(conversationRuntime)
      .set({
        sandboxId: params.sandboxId ?? null,
        sessionId: params.sessionId ?? null,
        sandboxProvider: params.sandboxProvider ?? null,
        runtimeHarness: params.runtimeHarness ?? null,
        runtimeProtocolVersion: params.runtimeProtocolVersion ?? null,
        status: params.status ?? "active",
      })
      .where(eq(conversationRuntime.id, params.runtimeId));
  },

  async clearActiveGeneration(params: {
    runtimeId: string;
    generationId: string;
  }): Promise<void> {
    await db
      .update(conversationRuntime)
      .set({
        activeGenerationId: null,
      })
      .where(
        and(
          eq(conversationRuntime.id, params.runtimeId),
          eq(conversationRuntime.activeGenerationId, params.generationId),
        ),
      );
  },

  async markRuntimeDead(runtimeId: string): Promise<void> {
    await db
      .update(conversationRuntime)
      .set({
        status: "dead",
        sandboxId: null,
        sessionId: null,
        activeGenerationId: null,
      })
      .where(eq(conversationRuntime.id, runtimeId));
  },

  async suspendRuntime(runtimeId: string): Promise<void> {
    await db
      .update(conversationRuntime)
      .set({
        status: "active",
        sandboxId: null,
        sessionId: null,
      })
      .where(eq(conversationRuntime.id, runtimeId));
  },

  async authorizeRuntimeTurn(params: {
    runtimeId: string;
    turnSeq: number;
    authorizationHeader: string | null;
  }): Promise<AuthorizedRuntimeContext> {
    const token = params.authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return { ok: false, reason: "invalid_token" };
    }

    const runtime = await db
      .select({
        id: conversationRuntime.id,
        callbackToken: conversationRuntime.callbackToken,
        status: conversationRuntime.status,
        activeGenerationId: conversationRuntime.activeGenerationId,
        activeTurnSeq: conversationRuntime.activeTurnSeq,
        conversationId: conversation.id,
        userId: conversation.userId,
      })
      .from(conversationRuntime)
      .innerJoin(conversation, eq(conversation.id, conversationRuntime.conversationId))
      .where(eq(conversationRuntime.id, params.runtimeId))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!runtime) {
      return { ok: false, reason: "runtime_not_found" };
    }
    if (runtime.callbackToken !== token) {
      return { ok: false, reason: "invalid_token" };
    }
    if (runtime.status !== "active" || !runtime.activeGenerationId) {
      return { ok: false, reason: "runtime_not_active" };
    }
    if (runtime.activeTurnSeq !== params.turnSeq) {
      return { ok: false, reason: "stale_turn" };
    }
    if (!runtime.userId) {
      return { ok: false, reason: "runtime_not_found" };
    }

    return {
      ok: true,
      runtimeId: runtime.id,
      conversationId: runtime.conversationId,
      generationId: runtime.activeGenerationId,
      userId: runtime.userId,
      turnSeq: runtime.activeTurnSeq,
    };
  },
};
