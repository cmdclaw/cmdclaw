import type { SandboxProvider } from "./base";

export class BYOCProvider implements SandboxProvider {
  readonly id = "byoc" as const;
}
