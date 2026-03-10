import { beforeEach, describe, expect, it, vi } from "vitest";

var userFindFirstMock: ReturnType<typeof vi.fn>;
var workspaceMemberFindFirstMock: ReturnType<typeof vi.fn>;
var workspaceFindFirstMock: ReturnType<typeof vi.fn>;
var workspaceInsertReturningMock: ReturnType<typeof vi.fn>;
var billingTopUpInsertReturningMock: ReturnType<typeof vi.fn>;
var workspaceInsertValuesMock: ReturnType<typeof vi.fn>;
var workspaceMemberInsertValuesMock: ReturnType<typeof vi.fn>;
var billingTopUpInsertValuesMock: ReturnType<typeof vi.fn>;
var userUpdateWhereMock: ReturnType<typeof vi.fn>;
var userUpdateSetMock: ReturnType<typeof vi.fn>;
var balancesCreateMock: ReturnType<typeof vi.fn>;
var insertMock: ReturnType<typeof vi.fn>;

vi.mock("@/server/db/client", () => ({
  db: (() => {
    userFindFirstMock = vi.fn();
    workspaceMemberFindFirstMock = vi.fn();
    workspaceFindFirstMock = vi.fn();
    workspaceInsertReturningMock = vi.fn();
    billingTopUpInsertReturningMock = vi.fn();
    workspaceInsertValuesMock = vi.fn(() => ({
      returning: workspaceInsertReturningMock,
    }));
    workspaceMemberInsertValuesMock = vi.fn().mockResolvedValue(undefined);
    billingTopUpInsertValuesMock = vi.fn(() => ({
      returning: billingTopUpInsertReturningMock,
    }));
    userUpdateWhereMock = vi.fn();
    userUpdateSetMock = vi.fn(() => ({
      where: userUpdateWhereMock,
    }));
    insertMock = vi.fn();

    return {
      query: {
        user: { findFirst: userFindFirstMock },
        workspaceMember: { findFirst: workspaceMemberFindFirstMock },
        workspace: { findFirst: workspaceFindFirstMock },
      },
      insert: insertMock,
      update: vi.fn(() => ({
        set: userUpdateSetMock,
      })),
    };
  })(),
}));

vi.mock("@cmdclaw/core/server/billing/autumn", () => ({
  getAutumnClient: (() => {
    balancesCreateMock = vi.fn();
    return vi.fn(() => ({
      balances: { create: balancesCreateMock },
      customers: {
        get: vi.fn().mockRejectedValue(new Error("missing")),
        create: vi.fn().mockResolvedValue({}),
      },
    }));
  })(),
}));

import {
  createManualTopUp,
  createWorkspaceForUser,
  resolveBillingOwnerForUser,
} from "@cmdclaw/core/server/billing/service";

describe("billing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockReturnValue({ values: billingTopUpInsertValuesMock });
    balancesCreateMock.mockResolvedValue({ data: { message: "ok" }, error: null });
    workspaceInsertReturningMock.mockResolvedValue([
      {
        id: "ws-created",
        name: "Alice's workspace",
        slug: "alice-workspace-1234",
        billingPlanId: "free",
        autumnCustomerId: null,
      },
    ]);
    billingTopUpInsertReturningMock.mockResolvedValue([
      {
        id: "topup-1",
        creditsGranted: 2500,
        expiresAt: new Date("2027-03-09T00:00:00.000Z"),
      },
    ]);
    userUpdateWhereMock.mockResolvedValue(undefined);
  });

  it("resolves workspace billing for any active workspace plan", async () => {
    userFindFirstMock.mockResolvedValue({
      id: "user-1",
      activeWorkspaceId: "ws-1",
    });
    workspaceMemberFindFirstMock.mockResolvedValue({
      workspace: {
        id: "ws-1",
        name: "Alpha",
        billingPlanId: "pro",
        autumnCustomerId: "cus-ws-1",
      },
    });

    const owner = await resolveBillingOwnerForUser("user-1");

    expect(owner).toEqual({
      ownerType: "workspace",
      ownerId: "ws-1",
      autumnCustomerId: "cus-ws-1",
      planId: "pro",
    });
  });

  it("auto-creates a free workspace when the user has none", async () => {
    insertMock
      .mockReturnValueOnce({ values: workspaceInsertValuesMock })
      .mockReturnValueOnce({ values: workspaceMemberInsertValuesMock });
    userFindFirstMock
      .mockResolvedValueOnce({
        id: "user-1",
        activeWorkspaceId: null,
      })
      .mockResolvedValueOnce({
        id: "user-1",
        name: "Alice",
      });
    workspaceMemberFindFirstMock.mockResolvedValue(null);
    workspaceFindFirstMock.mockResolvedValue(null);

    const owner = await resolveBillingOwnerForUser("user-1");

    expect(workspaceInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        createdByUserId: "user-1",
        billingPlanId: "free",
      }),
    );
    expect(workspaceMemberInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-created",
        userId: "user-1",
        role: "owner",
      }),
    );
    expect(owner).toEqual({
      ownerType: "workspace",
      ownerId: "ws-created",
      autumnCustomerId: "ws-created",
      planId: "free",
    });
  });

  it("creates new workspaces on the free plan", async () => {
    insertMock
      .mockReturnValueOnce({ values: workspaceInsertValuesMock })
      .mockReturnValueOnce({ values: workspaceMemberInsertValuesMock });
    workspaceFindFirstMock.mockResolvedValue(null);

    await createWorkspaceForUser("user-1", "Alpha");

    expect(workspaceInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Alpha",
        billingPlanId: "free",
      }),
    );
  });

  it("grants top-up credits to the workspace owner only", async () => {
    const result = await createManualTopUp({
      owner: {
        ownerType: "workspace",
        ownerId: "ws-1",
        autumnCustomerId: "cus-ws-1",
        planId: "free",
      },
      grantedByUserId: "admin-1",
      usdAmount: 25,
    });

    expect(balancesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: "cus-ws-1",
        feature_id: "llm_credits",
        granted_balance: 2500,
      }),
    );
    expect(billingTopUpInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: "workspace",
        userId: null,
        workspaceId: "ws-1",
        usdAmount: 25,
        creditsGranted: 2500,
      }),
    );
    expect(result.creditsGranted).toBe(2500);
  });
});
