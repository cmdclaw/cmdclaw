import type { RuntimeHarness } from "./base";

export class OpencodeHarness implements RuntimeHarness {
  readonly id = "opencode" as const;
}
