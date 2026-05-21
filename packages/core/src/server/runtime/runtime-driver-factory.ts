import {
  OpenCodeGenerationRuntimeDriver,
  type OpenCodeGenerationRuntimeDriverDependencies,
} from "./opencode/opencode-generation-runtime-driver";
import type { GenerationRuntimeDriver } from "./runtime-generation-driver";

export type RuntimeDriverFactoryInput = {
  adapter: "opencode";
  opencode: OpenCodeGenerationRuntimeDriverDependencies;
};

export function createRuntimeDriver(
  input: RuntimeDriverFactoryInput,
): GenerationRuntimeDriver {
  switch (input.adapter) {
    case "opencode":
      return new OpenCodeGenerationRuntimeDriver(input.opencode);
  }
}
