/**
 * Factory for selecting the appropriate SandboxBackend based on context.
 */

import { env } from "../../env";
import type { SandboxBackend } from "./types";
import { DaytonaSandboxBackend, isDaytonaConfigured } from "./daytona";
import { DockerSandboxBackend, isDockerConfigured } from "./docker";
import { E2BSandboxBackend } from "./e2b";
import { isE2BConfigured } from "./e2b";

export type CloudSandboxProvider = "e2b" | "daytona" | "docker";

/**
 * SANDBOX_DEFAULT is authoritative: if it points to a provider that is not configured,
 * throw immediately instead of falling back to the other provider.
 */
export function getPreferredCloudSandboxProvider(): CloudSandboxProvider {
  const configuredDefault = env.SANDBOX_DEFAULT;

  if (configuredDefault === "e2b") {
    if (!isE2BConfigured()) {
      throw new Error("SANDBOX_DEFAULT is set to 'e2b' but E2B_API_KEY is not configured");
    }
    return "e2b";
  }

  if (configuredDefault === "daytona") {
    if (!isDaytonaConfigured()) {
      throw new Error("SANDBOX_DEFAULT is set to 'daytona' but DAYTONA_API_KEY is not configured");
    }
    return "daytona";
  }

  if (configuredDefault === "docker") {
    if (!isDockerConfigured()) {
      throw new Error(
        "SANDBOX_DEFAULT is set to 'docker' but Docker is not configured (missing Docker socket/DOCKER_HOST)",
      );
    }
    return "docker";
  }

  throw new Error(`Unsupported SANDBOX_DEFAULT value: ${configuredDefault}`);
}

/**
 * Get a SandboxBackend for a generation.
 */
export function getSandboxBackend(conversationId: string, userId: string): SandboxBackend {
  // Silence lint about unused params while preserving public API.
  void conversationId;
  void userId;

  const provider = getPreferredCloudSandboxProvider();
  if (provider === "e2b") {
    return new E2BSandboxBackend();
  }
  if (provider === "daytona") {
    return new DaytonaSandboxBackend();
  }
  return new DockerSandboxBackend();
}
