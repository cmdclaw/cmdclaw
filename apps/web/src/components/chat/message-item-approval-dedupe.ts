import type { ActivityItemData } from "./activity-item";

export type DisplaySegmentApproval = {
  toolUseId: string;
  toolName: string;
  toolInput: unknown;
  integration: string;
  operation: string;
  command?: string;
  status: "approved" | "denied";
  questionAnswers?: string[][];
};

export type DisplaySegmentForApprovalDedupe = {
  id: string;
  items: ActivityItemData[];
  approval: DisplaySegmentApproval | null;
};

function normalizeApprovalSignatureValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeApprovalSignatureValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeApprovalSignatureValue(entry)]),
    );
  }

  return value;
}

function getApprovalDisplaySignature(approval: DisplaySegmentApproval): string {
  return JSON.stringify(
    normalizeApprovalSignatureValue({
      toolName: approval.toolName,
      toolInput: approval.toolInput,
      integration: approval.integration,
      operation: approval.operation,
      command: approval.command,
      status: approval.status,
      questionAnswers: approval.questionAnswers,
    }),
  );
}

function mergeDuplicateApprovalSegments(
  existing: DisplaySegmentForApprovalDedupe,
  duplicate: DisplaySegmentForApprovalDedupe,
): DisplaySegmentForApprovalDedupe {
  const existingApproval = existing.approval;
  const duplicateApproval = duplicate.approval;

  if (!existingApproval || !duplicateApproval) {
    return existing;
  }

  return {
    ...existing,
    items:
      existing.items.length > 0
        ? duplicate.items.length > 0
          ? [...existing.items, ...duplicate.items]
          : existing.items
        : duplicate.items,
    approval: {
      ...existingApproval,
      ...duplicateApproval,
      command: duplicateApproval.command ?? existingApproval.command,
      questionAnswers:
        duplicateApproval.questionAnswers && duplicateApproval.questionAnswers.length > 0
          ? duplicateApproval.questionAnswers
          : existingApproval.questionAnswers,
    },
  };
}

export function dedupeApprovalSegments(
  segments: DisplaySegmentForApprovalDedupe[],
): DisplaySegmentForApprovalDedupe[] {
  const deduped: DisplaySegmentForApprovalDedupe[] = [];

  for (const segment of segments) {
    const previous = deduped[deduped.length - 1];
    if (
      previous?.approval &&
      segment.approval &&
      getApprovalDisplaySignature(previous.approval) ===
        getApprovalDisplaySignature(segment.approval)
    ) {
      deduped[deduped.length - 1] = mergeDuplicateApprovalSegments(previous, segment);
      continue;
    }

    deduped.push(segment);
  }

  return deduped;
}
