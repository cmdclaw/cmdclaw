import { verifyManagedMcpToken } from "../../../../../packages/core/src/server/managed-mcp-auth";

export default function managedGmailMiddleware(req: any, res: any, next: () => void) {
  const authHeader = req.headers?.authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }

  try {
    const claims = verifyManagedMcpToken(token, process.env.CMDCLAW_SERVER_SECRET ?? "");
    req.auth = {
      token,
      clientId: "cmdclaw-executor",
      scopes: [],
      expiresAt: claims.exp,
      extra: claims,
    };
    next();
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : "Unauthorized" });
  }
}
