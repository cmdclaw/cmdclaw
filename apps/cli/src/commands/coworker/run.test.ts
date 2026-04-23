import { describe, expect, it, vi } from "vitest";
import { runCoworkerFromDefinition } from "./run";

describe("runCoworkerFromDefinition", () => {
  it("imports, enables, and runs a coworker from definition JSON", async () => {
    const runner = {
      importDefinition: vi.fn().mockResolvedValue({
        id: "cw-imported",
        name: "Imported coworker",
        description: null,
        username: "imported-coworker",
        status: "off",
      }),
      update: vi.fn().mockResolvedValue({ success: true }),
      run: vi.fn().mockResolvedValue({
        coworkerId: "cw-imported",
        runId: "run-1",
        generationId: "gen-1",
        conversationId: "conv-1",
      }),
    };

    const result = await runCoworkerFromDefinition({
      runner: runner as never,
      payload: { source: "test" },
      jsonCoworker: '{"version":1}',
    });

    expect(runner.importDefinition).toHaveBeenCalledWith('{"version":1}');
    expect(runner.update).toHaveBeenCalledWith({ id: "cw-imported", status: "on" });
    expect(runner.run).toHaveBeenCalledWith("cw-imported", { source: "test" });
    expect(result).toEqual({
      importedCoworker: {
        id: "cw-imported",
        name: "Imported coworker",
        description: null,
        username: "imported-coworker",
        status: "off",
      },
      triggeredRun: {
        coworkerId: "cw-imported",
        runId: "run-1",
        generationId: "gen-1",
        conversationId: "conv-1",
      },
    });
  });

  it("runs an existing coworker when no definition JSON is provided", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        coworkerId: "cw-1",
        runId: "run-1",
        generationId: "gen-1",
        conversationId: "conv-1",
      }),
    };

    const result = await runCoworkerFromDefinition({
      runner: runner as never,
      reference: "@existing",
      payload: { source: "test" },
    });

    expect(runner.run).toHaveBeenCalledWith("@existing", { source: "test" });
    expect(result).toEqual({
      importedCoworker: null,
      triggeredRun: {
        coworkerId: "cw-1",
        runId: "run-1",
        generationId: "gen-1",
        conversationId: "conv-1",
      },
    });
  });

  it("rejects combining a coworker reference with definition JSON", async () => {
    await expect(
      runCoworkerFromDefinition({
        runner: {} as never,
        reference: "@existing",
        jsonCoworker: '{"version":1}',
      }),
    ).rejects.toThrow("Cannot combine a coworker reference with --json-coworker.");
  });

  it("requires either a reference or definition JSON", async () => {
    await expect(
      runCoworkerFromDefinition({
        runner: {} as never,
      }),
    ).rejects.toThrow("Coworker reference is required unless --json-coworker is provided.");
  });
});
