import {
  authenticateHostedMcpRequest,
  sendUnauthorizedMcpResponse,
} from "../../../shared/auth";

export default async function cmdclawMiddleware(req: any, res: any, next: () => void) {
  try {
    req.auth = await authenticateHostedMcpRequest({
      req,
      requiredAudience: "cmdclaw",
    });
    next();
  } catch (error) {
    sendUnauthorizedMcpResponse({
      req,
      res,
      slug: "cmdclaw",
      message: error instanceof Error ? error.message : "Unauthorized",
    });
  }
}
