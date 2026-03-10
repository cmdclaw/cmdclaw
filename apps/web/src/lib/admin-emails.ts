const ADMIN_EMAILS = new Set(["baptiste@heybap.com"]);

export function shouldGrantAdminRole(email: string): boolean {
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}
