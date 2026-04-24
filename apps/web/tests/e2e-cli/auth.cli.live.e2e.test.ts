import { beforeAll, describe, expect, test } from "vitest";
import {
  buildWorktreeAutoLoginPath,
  canUseWorktreeAutoLoginForRequest,
} from "@/lib/worktree-auto-login";
import { defaultServerUrl, ensureCliAuth, liveEnabled, responseTimeoutMs } from "./live-fixtures";

describe.runIf(liveEnabled)("@live CLI auth", () => {
  beforeAll(async () => {
    await ensureCliAuth();
  });

  test(
    "auth smoke: unauth /chat redirects to /login callback and public routes stay reachable",
    { timeout: Math.max(responseTimeoutMs, 30_000) },
    async () => {
      const usesWorktreeAutoLogin = canUseWorktreeAutoLoginForRequest(defaultServerUrl);
      const expectedWorktreeRedirect = buildWorktreeAutoLoginPath("/chat");

      const chatResponse = await fetch(`${defaultServerUrl}/chat`, { redirect: "manual" });
      expect(chatResponse.status).toBeGreaterThanOrEqual(300);
      expect(chatResponse.status).toBeLessThan(400);
      expect(chatResponse.headers.get("location") ?? "").toContain(
        usesWorktreeAutoLogin ? expectedWorktreeRedirect : "/login?callbackUrl=%2Fchat",
      );

      const loginResponse = await fetch(`${defaultServerUrl}/login?callbackUrl=%2Fchat`, {
        redirect: "manual",
      });
      const loginExpectationMet = usesWorktreeAutoLogin
        ? loginResponse.status >= 300 && loginResponse.status < 400
        : loginResponse.ok;
      expect(loginExpectationMet).toBe(true);
      const loginBodyOrLocation = usesWorktreeAutoLogin
        ? (loginResponse.headers.get("location") ?? "")
        : await loginResponse.text();
      expect(loginBodyOrLocation).toContain(
        usesWorktreeAutoLogin ? expectedWorktreeRedirect : "Log in",
      );

      const termsResponse = await fetch(`${defaultServerUrl}/legal/terms`);
      expect(termsResponse.ok).toBeTruthy();

      const supportResponse = await fetch(`${defaultServerUrl}/support`);
      expect(supportResponse.ok).toBeTruthy();

      const rpcResponse = await fetch(`${defaultServerUrl}/api/rpc`, { redirect: "manual" });
      expect([301, 302, 303, 307, 308]).not.toContain(rpcResponse.status);
    },
  );
});
