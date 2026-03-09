import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  userFindFirstMock,
  workspaceMemberFindFirstMock,
  workspaceFindFirstMock,
  billingTopUpInsertValuesMock,
  billingTopUpInsertReturningMock,
  userUpdateSetMock,
  userUpdateWhereMock,
  balancesCreateMock,
} = vi.hoisted(() => {
  const userFindFirstMock = vi.fn();
  const workspaceMemberFindFirstMock = vi.fn();
  const workspaceFindFirstMock = vi.fn();
  const billingTopUpInsertReturningMock = vi.fn();
  const billingTopUpInsertValuesMock = vi.fn(() => ({
    returning: billingTopUpInsertReturningMock,
  }));
  const userUpdateWhereMock = vi.fn();
  const userUpdateSetMock = vi.fn(() => ({
    where: userUpdateWhereMock,
  }));
  const balancesCreateMock = vi.fn();

  return {
    userFindFirstMock,
    workspaceMemberFindFirstMock,
    workspaceFindFirstMock,
    billingTopUpInsertValuesMock,
    billingTopUpInsertReturningMock,
    userUpdateSetMock,
    userUpdateWhereMock,
    balancesCreateMock,
  };
});

vi.mock("@/server/db/client", () => ({
  db: {
    query: {
      user: { findFirst: userFindFirstMock },
      workspaceMember: { findFirst: workspaceMemberFindFirstMock },
      workspace: { findFirst: workspaceFindFirstMock },
    },
    insert: vi.fn(() => ({
      values: billingTopUpInsertValuesMock,
    })),
    update: vi.fn(() => ({
      set: userUpdateSetMock,
    })),
  },
}));

vi.mock("./autumn", () => ({
  getAutumnClient: vi.fn(() => ({
    balances: { create: balancesCreateMock },
    customers: {
      get: vi.fn().mockRejectedValue(new Error("missing")),
      create: vi.fn().mockResolvedValue({}),
    },
  })),
}));

import { createManualTopUp, resolveBillingOwnerForUser } from "./service";

describe("billing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    balancesCreateMock.mockResolvedValue({ data: { message: "ok" }, error: null });
    billingTopUpInsertReturningMock.mockResolvedValue([
      {
        id: "topup-1",
        creditsGranted: 2500,
        expiresAt: new Date("2027-03-09T00:00:00.000Z"),
      },
    ]);
    userUpdateWhereMock.mockResolvedValue(undefined);
  });

  it("resolves personal billing for free/pro users", async () => {
    userFindFirstMock.mockResolvedValue({
      id: "user-1",
      billingPlanId: "pro",
      autumnCustomerId: "cus-user-1",
      activeWorkspaceId: null,
    });

    const owner = await resolveBillingOwnerForUser("user-1");

    expect(owner).toEqual({
      ownerType: "user",
      ownerId: "user-1",
      autumnCustomerId: "cus-user-1",
      planId: "pro",
    });
  });

  it("resolves workspace billing for business orgs", async () => {
    userFindFirstMock.mockResolvedValue({
      id: "user-1",
      billingPlanId: "free",
      autumnCustomerId: "cus-user-1",
      activeWorkspaceId: "ws-1",
    });
    workspaceMemberFindFirstMock.mockResolvedValue({
      workspace: {
        id: "ws-1",
        billingPlanId: "business",
        autumnCustomerId: "cus-ws-1",
      },
    });

    const owner = await resolveBillingOwnerForUser("user-1");

    expect(owner).toEqual({
      ownerType: "workspace",
      ownerId: "ws-1",
      autumnCustomerId: "cus-ws-1",
      planId: "business",
    });
  });

  it("grants custom top-up credits at 100 credits per USD", async () => {
    const result = await createManualTopUp({
      owner: {
        ownerType: "user",
        ownerId: "user-1",
        autumnCustomerId: "cus-user-1",
        planId: "free",
      },
      grantedByUserId: "admin-1",
      usdAmount: 25,
    });

    expect(balancesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: "cus-user-1",
        feature_id: "llm_credits",
        granted_balance: 2500,
      }),
    );
    expect(billingTopUpInsertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        usdAmount: 25,
        creditsGranted: 2500,
      }),
    );
    expect(result.creditsGranted).toBe(2500);
  });
});
