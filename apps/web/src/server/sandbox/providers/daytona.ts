import type { SandboxProvider } from "./base";

export class DaytonaProvider implements SandboxProvider {
  readonly id = "daytona" as const;
}
