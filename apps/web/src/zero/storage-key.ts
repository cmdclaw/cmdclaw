export function buildZeroStorageKey(params: { userId: string; workspaceId: string }): string {
  return `bap-web:${params.userId}:${params.workspaceId}`;
}
