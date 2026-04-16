import {
  authenticateHostedMcpRequest,
  sendUnauthorizedMcpResponse,
} from "../../../shared/auth";

export default async function internalMiddleware(req: any, res: any, next: () => void) {
  try {
    req.auth = await authenticateHostedMcpRequest({
      req,
      requiredAudience: "internal",
    });
    next();
  } catch (error) {
    sendUnauthorizedMcpResponse({
      req,
      res,
      slug: "internal",
      message: error instanceof Error ? error.message : "Unauthorized",
    });
  }
}
