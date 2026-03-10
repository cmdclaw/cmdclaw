import type { SandboxProvider } from "./base";

export class DockerProvider implements SandboxProvider {
  readonly id = "docker" as const;
}
