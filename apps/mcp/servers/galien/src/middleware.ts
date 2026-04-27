import {
  authenticateHostedMcpRequest,
  sendUnauthorizedMcpResponse,
} from "../../../shared/auth";

export default async function galienMiddleware(req: any, res: any, next: () => void) {
  try {
    req.auth = await authenticateHostedMcpRequest({
      req,
      requiredAudience: "galien",
      allowManagedToken: true,
    });
    next();
  } catch (error) {
    sendUnauthorizedMcpResponse({
      req,
      res,
      slug: "galien",
      message: error instanceof Error ? error.message : "Unauthorized",
    });
  }
}
