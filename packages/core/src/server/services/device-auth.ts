/**
 * Device authentication helpers for WebSocket connections.
 */

import { and, eq, gt } from "drizzle-orm";
import { db } from "@cmdclaw/db/client";
import { device, session } from "@cmdclaw/db/schema";

/**
 * Verify a Better Auth bearer token and resolve the device.
 * Used by the WebSocket server to authenticate device connections.
 */
export async function verifyDeviceToken(
  token: string,
  deviceId: string,
): Promise<{ userId: string; deviceId: string } | null> {
  try {
    const activeSession = await db.query.session.findFirst({
      where: and(eq(session.token, token), gt(session.expiresAt, new Date())),
    });

    if (!activeSession?.userId) {
      return null;
    }

    const dev = await db.query.device.findFirst({
      where: eq(device.id, deviceId),
    });

    if (!dev || dev.userId !== activeSession.userId) {
      return null;
    }

    return { userId: activeSession.userId, deviceId };
  } catch {
    return null;
  }
}
