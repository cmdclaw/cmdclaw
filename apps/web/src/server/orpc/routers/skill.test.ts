import { beforeEach, describe, expect, it, vi } from "vitest";

function createProcedureStub() {
  const stub = {
    input: vi.fn(),
    output: vi.fn(),
    handler: vi.fn((fn: unknown) => fn),
  };
  stub.input.mockReturnValue(stub);
  stub.output.mockReturnValue(stub);
  return stub;
}

const {
  uploadToS3Mock,
  deleteFromS3Mock,
  getPresignedDownloadUrlMock,
  generateStorageKeyMock,
  ensureBucketMock,
  validateFileUploadMock,
  importSkillMock,
  requireActiveWorkspaceAccessMock,
  resolveUniqueSkillNameInWorkspaceMock,
  copySkillToWorkspaceOwnerMock,
} = vi.hoisted(() => ({
  uploadToS3Mock: vi.fn(),
  deleteFromS3Mock: vi.fn(),
  getPresignedDownloadUrlMock: vi.fn(),
  generateStorageKeyMock: vi.fn(),
  ensureBucketMock: vi.fn(),
  validateFileUploadMock: vi.fn(),
  importSkillMock: vi.fn(),
  requireActiveWorkspaceAccessMock: vi.fn(),
  resolveUniqueSkillNameInWorkspaceMock: vi.fn(),
  copySkillToWorkspaceOwnerMock: vi.fn(),
}));

vi.mock("../middleware", () => ({
  protectedProcedure: createProcedureStub(),
}));

vi.mock("../workspace-access", () => ({
  requireActiveWorkspaceAccess: requireActiveWorkspaceAccessMock,
}));

vi.mock("@cmdclaw/core/server/storage/s3-client", () => ({
  uploadToS3: uploadToS3Mock,
  deleteFromS3: deleteFromS3Mock,
  getPresignedDownloadUrl: getPresignedDownloadUrlMock,
  generateStorageKey: generateStorageKeyMock,
  ensureBucket: ensureBucketMock,
}));

vi.mock("@cmdclaw/core/server/services/workspace-skill-service", () => ({
  buildAccessibleSkillWhere: vi.fn(() => "accessible-where"),
  buildOwnedSkillWhere: vi.fn(() => "owned-where"),
  copySkillToWorkspaceOwner: copySkillToWorkspaceOwnerMock,
  resolveUniqueSkillNameInWorkspace: resolveUniqueSkillNameInWorkspaceMock,
}));

vi.mock("@/server/storage/validation", () => ({
  validateFileUpload: validateFileUploadMock,
}));

vi.mock("@/server/services/skill-import", () => ({
  importSkill: importSkillMock,
}));

import { skillRouter } from "./skill";

const skillRouterAny = skillRouter as unknown as Record<
  string,
  (args: unknown) => Promise<unknown>
>;

function createContext() {
  const insertReturningMock = vi.fn();
  const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }));
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));

  const updateReturningMock = vi.fn();
  const updateWhereMock = vi.fn(() => ({ returning: updateReturningMock }));
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  const deleteReturningMock = vi.fn();
  const deleteWhereMock = vi.fn(() => ({ returning: deleteReturningMock }));
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

  const selectWhereMock = vi.fn();
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
  const selectMock = vi.fn(() => ({ from: selectFromMock }));

  return {
    user: { id: "user-1" },
    db: {
      query: {
        skill: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
        },
        skillFile: {
          findFirst: vi.fn(),
        },
        skillDocument: {
          findFirst: vi.fn(),
        },
      },
      insert: insertMock,
      update: updateMock,
      delete: deleteMock,
      select: selectMock,
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => await callback({})),
    },
    mocks: {
      insertReturningMock,
      insertValuesMock,
      updateSetMock,
      updateWhereMock,
      updateReturningMock,
      deleteReturningMock,
      selectWhereMock,
    },
  };
}

describe("skillRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireActiveWorkspaceAccessMock.mockResolvedValue({
      workspace: { id: "ws-1" },
      membership: { role: "member" },
    });
    resolveUniqueSkillNameInWorkspaceMock.mockImplementation(
      async (_db: unknown, _workspaceId: string, name: string) => name,
    );
    generateStorageKeyMock.mockReturnValue("skills/user-1/skill-1/doc.pdf");
    getPresignedDownloadUrlMock.mockResolvedValue("https://example.com/doc.pdf");
  });

  it("lists accessible skills with owner and visibility info", async () => {
    const context = createContext();
    const now = new Date("2024-01-01T00:00:00.000Z");
    context.db.query.skill.findMany.mockResolvedValue([
      {
        id: "skill-1",
        name: "my-skill",
        displayName: "My Skill",
        description: "desc",
        icon: "rocket",
        enabled: true,
        visibility: "private",
        userId: "user-1",
        createdAt: now,
        updatedAt: now,
        files: [{ id: "f1" }, { id: "f2" }],
        user: { id: "user-1", name: "Me", email: "me@example.com" },
      },
      {
        id: "skill-2",
        name: "shared-skill",
        displayName: "Shared Skill",
        description: "shared",
        icon: null,
        enabled: true,
        visibility: "public",
        userId: "user-2",
        createdAt: now,
        updatedAt: now,
        files: [{ id: "f3" }],
        user: { id: "user-2", name: "Alex", email: "alex@example.com" },
      },
    ]);

    await expect(skillRouterAny.list({ context })).resolves.toEqual([
      expect.objectContaining({
        id: "skill-1",
        visibility: "private",
        fileCount: 2,
        owner: { id: "user-1", name: "Me", email: "me@example.com" },
        isOwnedByCurrentUser: true,
        canEdit: true,
      }),
      expect.objectContaining({
        id: "skill-2",
        visibility: "public",
        fileCount: 1,
        owner: { id: "user-2", name: "Alex", email: "alex@example.com" },
        isOwnedByCurrentUser: false,
        canEdit: false,
      }),
    ]);
  });

  it("gets a shared skill for read-only access", async () => {
    const context = createContext();
    const now = new Date("2024-02-02T00:00:00.000Z");
    context.db.query.skill.findFirst.mockResolvedValue({
      id: "skill-1",
      name: "shared-skill",
      displayName: "Shared Skill",
      description: "desc",
      icon: null,
      enabled: true,
      visibility: "public",
      userId: "user-2",
      files: [
        {
          id: "file-1",
          path: "SKILL.md",
          content: "content",
          createdAt: now,
          updatedAt: now,
        },
      ],
      documents: [
        {
          id: "doc-1",
          filename: "doc.pdf",
          path: "references/doc.pdf",
          mimeType: "application/pdf",
          sizeBytes: 42,
          description: "spec",
          createdAt: now,
        },
      ],
      user: {
        id: "user-2",
        name: "Alex",
        email: "alex@example.com",
      },
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      skillRouterAny.get({
        input: { id: "skill-1" },
        context,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "skill-1",
        visibility: "public",
        owner: { id: "user-2", name: "Alex", email: "alex@example.com" },
        isOwnedByCurrentUser: false,
        canEdit: false,
      }),
    );
  });

  it("creates a private workspace skill and seeds SKILL.md", async () => {
    const context = createContext();
    context.mocks.insertReturningMock.mockResolvedValue([
      {
        id: "skill-1",
        name: "my-skill",
        displayName: "My Skill",
        description: "A test skill",
        icon: "sparkles",
        visibility: "private",
      },
    ]);

    await expect(
      skillRouterAny.create({
        input: {
          displayName: "My Skill",
          description: "A test skill",
          icon: "sparkles",
        },
        context,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "skill-1",
        name: "my-skill",
        visibility: "private",
      }),
    );

    expect(context.mocks.insertValuesMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "ws-1",
        visibility: "private",
      }),
    );
  });

  it("delegates imports with the active workspace id", async () => {
    const context = createContext();
    importSkillMock.mockResolvedValue({ id: "skill-1", name: "imported" });

    await skillRouterAny.import({
      input: {
        mode: "zip",
        filename: "skill.zip",
        contentBase64: "Zm9v",
      },
      context,
    });

    expect(importSkillMock).toHaveBeenCalledWith(context.db, "user-1", "ws-1", {
      mode: "zip",
      filename: "skill.zip",
      contentBase64: "Zm9v",
    });
  });

  it("shares and unshares owned skills", async () => {
    const context = createContext();
    context.db.query.skill.findFirst.mockResolvedValue({
      id: "skill-1",
      userId: "user-1",
      workspaceId: "ws-1",
    });
    context.mocks.updateReturningMock
      .mockResolvedValueOnce([{ id: "skill-1", visibility: "public" }])
      .mockResolvedValueOnce([{ id: "skill-1", visibility: "private" }]);

    await expect(skillRouterAny.share({ input: { id: "skill-1" }, context })).resolves.toEqual({
      success: true,
      id: "skill-1",
      visibility: "public",
    });

    await expect(skillRouterAny.unshare({ input: { id: "skill-1" }, context })).resolves.toEqual({
      success: true,
      id: "skill-1",
      visibility: "private",
    });
  });

  it("copies a shared skill into a private saved copy", async () => {
    const context = createContext();
    context.db.query.skill.findFirst.mockResolvedValue({
      id: "skill-shared",
      userId: "user-2",
      workspaceId: "ws-1",
      visibility: "public",
    });
    copySkillToWorkspaceOwnerMock.mockResolvedValue({
      id: "skill-copy",
      name: "shared-skill-2",
      displayName: "Shared Skill",
      description: "shared",
      icon: null,
      enabled: false,
      visibility: "private",
    });

    await expect(
      skillRouterAny.saveShared({
        input: { sourceSkillId: "skill-shared" },
        context,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "skill-copy",
        enabled: false,
        visibility: "private",
      }),
    );
  });

  it("returns a document url for readable shared skills", async () => {
    const context = createContext();
    context.db.query.skillDocument.findFirst.mockResolvedValue({
      id: "doc-1",
      filename: "doc.pdf",
      storageKey: "skills/user-2/skill-shared/doc.pdf",
      skill: {
        userId: "user-2",
        workspaceId: "ws-1",
        visibility: "public",
      },
    });

    await expect(
      skillRouterAny.getDocumentUrl({
        input: { id: "doc-1" },
        context,
      }),
    ).resolves.toEqual({
      url: "https://example.com/doc.pdf",
      filename: "doc.pdf",
    });
  });

  it("rejects file updates for non-owners", async () => {
    const context = createContext();
    context.db.query.skillFile.findFirst.mockResolvedValue({
      id: "file-1",
      skill: {
        userId: "user-2",
        workspaceId: "ws-1",
      },
    });

    await expect(
      skillRouterAny.updateFile({
        input: { id: "file-1", content: "updated" },
        context,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
