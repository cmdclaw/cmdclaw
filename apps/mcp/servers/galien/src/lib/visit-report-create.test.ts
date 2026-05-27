import { describe, expect, it } from "vitest";
import {
  addCmdClawCommentMarker,
  buildVisitReportCreateBody,
  CMDCLAW_VISIT_REPORT_COMMENT_MARKER,
  GALIEN_VISIT_REPORT_CURRENT_VERSION,
  schema,
} from "../tools/visit-report.create";
import { validateGalienToolParams } from "./tool-helpers";

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

describe("buildVisitReportCreateBody", () => {
  it("defaults to a visit and strips unsupported fields before building the body", () => {
    const validated = validateGalienToolParams(schema, {
      clientId: 14,
      contactPersonId: 56550,
      contactOutcomeId: 20,
      visitDate: "2026-05-27T12:08:00.000Z",
      duration: 1800,
      promotion: true,
      plvUse: [1],
    });

    expect(validated).toEqual({
      clientId: 14,
      contactPersonId: 56550,
      contactOutcomeId: 20,
      visitDate: "2026-05-27T12:08:00.000Z",
      duration: 1800,
      contactTypeId: 1,
    });
  });

  it("adds the current Galien visit report version and marks the comment", () => {
    expect(
      buildVisitReportCreateBody({
        clientId: 14,
        contactPersonId: 56550,
        contactOutcomeId: 20,
        visitDate: "2026-05-27T12:08:00.000Z",
        duration: 1800,
        contactTypeId: 1,
        comment: "Rapport de visite de test",
      }),
    ).toEqual({
      clientId: 14,
      contactPersonId: 56550,
      contactOutcomeId: 20,
      visitDate: "2026-05-27T12:08:00.000Z",
      duration: 1800,
      contactTypeId: 1,
      localisation: 1,
      pharmacySize: 1,
      averagePassagesPerDay: 1,
      comment: `Rapport de visite de test\n\n${CMDCLAW_VISIT_REPORT_COMMENT_MARKER}`,
      version: GALIEN_VISIT_REPORT_CURRENT_VERSION,
    });
  });

  it("passes through the stable v5 visit report fields used by the Galien frontend", () => {
    expect(
      buildVisitReportCreateBody({
        clientId: 14,
        contactPersonId: 56550,
        contactOutcomeId: 20,
        visitDate: "2026-05-27T12:08:00.000Z",
        duration: 1800,
        contactTypeId: 1,
        localisation: 2,
        pharmacySize: 3,
        averagePassagesPerDay: 4,
      }),
    ).toMatchObject({
      contactTypeId: 1,
      localisation: 2,
      pharmacySize: 3,
      averagePassagesPerDay: 4,
      version: "v5",
    });
  });

  it("adds frontend-required v5 defaults for visit reports", () => {
    expect(
      buildVisitReportCreateBody({
        clientId: 14,
        contactPersonId: 56550,
        contactOutcomeId: 20,
        visitDate: "2026-05-27T12:08:00.000Z",
        duration: 1800,
        contactTypeId: 1,
        comment: "Rapport de visite de test",
      }),
    ).toMatchObject({
      contactTypeId: 1,
      localisation: 1,
      pharmacySize: 1,
      averagePassagesPerDay: 1,
      comment: `Rapport de visite de test\n\n${CMDCLAW_VISIT_REPORT_COMMENT_MARKER}`,
      version: "v5",
    });
  });

  it("does not add visit-only v5 defaults for calls", () => {
    expect(
      buildVisitReportCreateBody({
        clientId: 14,
        contactPersonId: 56550,
        contactOutcomeId: 1,
        visitDate: "2026-05-27T12:08:00.000Z",
        duration: 1800,
        contactTypeId: 2,
      }),
    ).toMatchObject({
      contactTypeId: 2,
      comment: CMDCLAW_VISIT_REPORT_COMMENT_MARKER,
      version: "v5",
    });
  });
});
