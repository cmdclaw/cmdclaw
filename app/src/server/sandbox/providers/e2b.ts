import type { SandboxProvider } from "./base";

export class E2BProvider implements SandboxProvider {
  readonly id = "e2b" as const;
}
