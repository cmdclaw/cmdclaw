import { db } from "@cmdclaw/db/client";
import { approvedLoginEmailAllowlist } from "@cmdclaw/db/schema";
import { desc, eq } from "drizzle-orm";
import { getAdminEmails, normalizeAdminEmail, shouldGrantAdminRole } from "@/lib/admin-emails";

export type ApprovedLoginEmailEntry = {
  id: string;
  email: string;
  createdByUserId: string | null;
  createdAt: Date | null;
  isBuiltIn: boolean;
};

export function normalizeApprovedLoginEmail(email: string): string {
  return normalizeAdminEmail(email);
}

export async function isApprovedLoginEmail(email: string): Promise<boolean> {
  const normalizedEmail = normalizeApprovedLoginEmail(email);
  if (shouldGrantAdminRole(normalizedEmail)) {
    return true;
  }

  const existing = await db.query.approvedLoginEmailAllowlist.findFirst({
    where: eq(approvedLoginEmailAllowlist.email, normalizedEmail),
    columns: { id: true },
  });

  return Boolean(existing);
}

export async function listApprovedLoginEmailEntries(): Promise<ApprovedLoginEmailEntry[]> {
  const builtInEmails = getAdminEmails();
  const storedEntries = await db.query.approvedLoginEmailAllowlist.findMany({
    columns: {
      id: true,
      email: true,
      createdByUserId: true,
      createdAt: true,
    },
    orderBy: (fields) => [desc(fields.createdAt)],
  });

  const builtInEntries = builtInEmails.map((email) => ({
    id: `builtin:${email}`,
    email,
    createdByUserId: null,
    createdAt: null,
    isBuiltIn: true,
  }));

  const storedNonBuiltInEntries = storedEntries
    .filter((entry) => !shouldGrantAdminRole(entry.email))
    .map((entry) => ({
      id: entry.id,
      email: entry.email,
      createdByUserId: entry.createdByUserId,
      createdAt: entry.createdAt,
      isBuiltIn: false,
    }));

  return [...builtInEntries, ...storedNonBuiltInEntries];
}
