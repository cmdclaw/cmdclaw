export const INVITE_ONLY_LOGIN_ERROR = "invite_only";

const ADMIN_EMAILS = new Set(["baptiste@heybap.com"]);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function shouldGrantAdminRole(email: string): boolean {
  return ADMIN_EMAILS.has(normalizeEmail(email));
}

export function getAdminEmails(): string[] {
  return [...ADMIN_EMAILS].toSorted();
}

export function normalizeAdminEmail(email: string): string {
  return normalizeEmail(email);
}
