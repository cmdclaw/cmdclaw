import { describe, expect, it } from "vitest";
import {
  addCmdClawCommentMarker,
  CMDCLAW_VISIT_REPORT_COMMENT_MARKER,
} from "../tools/visit-report.create";

describe("addCmdClawCommentMarker", () => {
  it("creates the comment when none is provided", () => {
    expect(addCmdClawCommentMarker()).toBe(CMDCLAW_VISIT_REPORT_COMMENT_MARKER);
    expect(addCmdClawCommentMarker("   ")).toBe(CMDCLAW_VISIT_REPORT_COMMENT_MARKER);
  });

  it("appends the CmdClaw marker to an existing comment", () => {
    expect(addCmdClawCommentMarker("Discussed follow-up plan.")).toBe(
      `Discussed follow-up plan.\n\n${CMDCLAW_VISIT_REPORT_COMMENT_MARKER}`,
    );
  });

  it("does not duplicate the CmdClaw marker", () => {
    expect(
      addCmdClawCommentMarker(
        `Discussed follow-up plan.\n\n${CMDCLAW_VISIT_REPORT_COMMENT_MARKER}`,
      ),
    ).toBe(`Discussed follow-up plan.\n\n${CMDCLAW_VISIT_REPORT_COMMENT_MARKER}`);
  });
});
