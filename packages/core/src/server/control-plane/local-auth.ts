import { eq, lt } from "drizzle-orm";
import { db } from "@cmdclaw/db/client";
import { controlPlaneAuthState } from "@cmdclaw/db/schema";

const AUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function createControlPlaneAuthState(params: { returnPath?: string | null }) {
  const cutoff = new Date(Date.now() - AUTH_STATE_TTL_MS);
  await db.delete(controlPlaneAuthState).where(lt(controlPlaneAuthState.createdAt, cutoff));

  const state = crypto.randomUUID();
  await db.insert(controlPlaneAuthState).values({
    state,
    returnPath: params.returnPath ?? null,
  });

  return state;
}

export async function consumeControlPlaneAuthState(state: string) {
  const [row] = await db
    .delete(controlPlaneAuthState)
    .where(eq(controlPlaneAuthState.state, state))
    .returning();

  if (!row) {
    return null;
  }

  if (Date.now() - row.createdAt.getTime() > AUTH_STATE_TTL_MS) {
    return null;
  }

  return row;
}
