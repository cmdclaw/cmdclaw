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

var attachPlanToOwnerMock: ReturnType<typeof vi.fn>;
var createManualTopUpMock: ReturnType<typeof vi.fn>;
var ensureWorkspaceForUserMock: ReturnType<typeof vi.fn>;
var getAdminBillingOverviewForUserMock: ReturnType<typeof vi.fn>;
var getBillingOverviewForUserMock: ReturnType<typeof vi.fn>;
var getExistingBillingOwnerForUserMock: ReturnType<typeof vi.fn>;
var getWorkspaceMembershipForUserMock: ReturnType<typeof vi.fn>;
var openBillingPortalForOwnerMock: ReturnType<typeof vi.fn>;
var cancelPlanForOwnerMock: ReturnType<typeof vi.fn>;

vi.mock("../middleware", () => ({
  protectedProcedure: createProcedureStub(),
}));

vi.mock("@cmdclaw/core/server/billing/service", () => ({
  addWorkspaceMembers: vi.fn(),
  attachPlanToOwner: (() => {
    attachPlanToOwnerMock = vi.fn();
    return attachPlanToOwnerMock;
  })(),
  cancelPlanForOwner: (() => {
    cancelPlanForOwnerMock = vi.fn();
    return cancelPlanForOwnerMock;
  })(),
  createManualTopUp: (() => {
    createManualTopUpMock = vi.fn();
    return createManualTopUpMock;
  })(),
  createWorkspaceForUser: vi.fn(),
  getAdminBillingOverviewForUser: (() => {
    getAdminBillingOverviewForUserMock = vi.fn();
    return getAdminBillingOverviewForUserMock;
  })(),
  ensureWorkspaceForUser: (() => {
    ensureWorkspaceForUserMock = vi.fn();
    return ensureWorkspaceForUserMock;
  })(),
  getBillingOverviewForUser: (() => {
    getBillingOverviewForUserMock = vi.fn();
    return getBillingOverviewForUserMock;
  })(),
  getExistingBillingOwnerForUser: (() => {
    getExistingBillingOwnerForUserMock = vi.fn();
    return getExistingBillingOwnerForUserMock;
  })(),
  getWorkspaceMembershipForUser: (() => {
    getWorkspaceMembershipForUserMock = vi.fn();
    return getWorkspaceMembershipForUserMock;
  })(),
  openBillingPortalForOwner: (() => {
    openBillingPortalForOwnerMock = vi.fn();
    return openBillingPortalForOwnerMock;
  })(),
  setActiveWorkspace: vi.fn(),
}));

import { billingRouter } from "./billing";

const billingRouterAny = billingRouter as unknown as Record<
  string,
  (args: unknown) => Promise<unknown>
>;

function createContext(role = "admin") {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      name: "Test User",
    },
    db: {
      query: {
        user: {
          findFirst: vi.fn().mockResolvedValue({
            role,
            activeWorkspaceId: "ws-1",
          }),
        },
        workspace: {
          findFirst: vi.fn().mockResolvedValue({
            id: "ws-1",
            autumnCustomerId: "cus-ws-1",
            billingPlanId: "free",
          }),
        },
      },
    },
  };
}

describe("billingRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureWorkspaceForUserMock.mockResolvedValue({
      id: "ws-1",
      name: "Alpha",
      billingPlanId: "free",
      autumnCustomerId: null,
    });
    getWorkspaceMembershipForUserMock.mockResolvedValue({
      role: "owner",
      workspaceId: "ws-1",
      userId: "user-1",
    });
    attachPlanToOwnerMock.mockResolvedValue({
      checkout_url: "https://checkout.example.com",
      customer_id: "cus-ws-1",
    });
    openBillingPortalForOwnerMock.mockResolvedValue({
      url: "https://portal.example.com",
    });
    createManualTopUpMock.mockResolvedValue({
      id: "topup-1",
      creditsGranted: 2500,
      expiresAt: new Date("2027-03-09T00:00:00.000Z"),
    });
    cancelPlanForOwnerMock.mockResolvedValue({ success: true });
    getBillingOverviewForUserMock.mockResolvedValue({
      owner: { ownerType: "workspace", ownerId: "ws-1", planId: "free" },
      plan: { id: "free" },
      workspaces: [],
    });
    getAdminBillingOverviewForUserMock.mockResolvedValue({
      targetUser: {
        id: "user-2",
        name: "Target User",
        email: "target@example.com",
      },
      activeWorkspace: {
        id: "ws-target",
        name: "Target Workspace",
        slug: "target-workspace",
      },
      plan: { id: "pro", name: "Pro" },
      feature: { balance: 900 },
      recentTopUps: [],
    });
    getExistingBillingOwnerForUserMock.mockResolvedValue({
      targetUser: {
        id: "user-2",
        name: "Target User",
        email: "target@example.com",
      },
      activeWorkspace: {
        id: "ws-target",
        name: "Target Workspace",
        slug: "target-workspace",
      },
      owner: {
        ownerType: "workspace",
        ownerId: "ws-target",
        autumnCustomerId: "cus-target",
        planId: "pro",
      },
    });
  });

  it("normalizes personal ownerType input to workspace billing", async () => {
    const result = (await billingRouterAny.attachPlan({
      input: {
        ownerType: "user",
        planId: "pro",
      },
      context: createContext(),
    })) as { checkoutUrl: string | null; customerId: string; planId: string };

    expect(ensureWorkspaceForUserMock).toHaveBeenCalledWith("user-1", "ws-1");
    expect(attachPlanToOwnerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: expect.objectContaining({
          ownerType: "workspace",
          ownerId: "ws-1",
        }),
        planId: "pro",
      }),
    );
    expect(result.planId).toBe("pro");
  });

  it("attaches workspace plans using the ensured workspace owner", async () => {
    const result = (await billingRouterAny.attachPlan({
      input: {
        ownerType: "workspace",
        planId: "pro",
      },
      context: createContext(),
    })) as { checkoutUrl: string | null; customerId: string; planId: string };

    expect(ensureWorkspaceForUserMock).toHaveBeenCalledWith("user-1", "ws-1");
    expect(attachPlanToOwnerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: expect.objectContaining({
          ownerType: "workspace",
          ownerId: "ws-1",
        }),
        planId: "pro",
      }),
    );
    expect(result).toEqual({
      checkoutUrl: "https://checkout.example.com",
      customerId: "cus-ws-1",
      planId: "pro",
    });
  });

  it("opens the billing portal for the ensured workspace", async () => {
    const result = (await billingRouterAny.openPortal({
      input: {
        ownerType: "workspace",
      },
      context: createContext(),
    })) as { url: string };

    expect(openBillingPortalForOwnerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: "workspace",
        ownerId: "ws-1",
      }),
      undefined,
    );
    expect(result.url).toBe("https://portal.example.com");
  });

  it("returns an admin overview for a target user", async () => {
    const result = (await billingRouterAny.adminUserOverview({
      input: {
        targetUserId: "user-2",
      },
      context: createContext(),
    })) as {
      targetUser: { id: string };
      activeWorkspace: { id: string } | null;
    };

    expect(getAdminBillingOverviewForUserMock).toHaveBeenCalledWith("user-2");
    expect(result.targetUser.id).toBe("user-2");
    expect(result.activeWorkspace?.id).toBe("ws-target");
  });

  it("blocks admin overview for non-admin users", async () => {
    await expect(
      billingRouterAny.adminUserOverview({
        input: {
          targetUserId: "user-2",
        },
        context: createContext("member"),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Admin role required for manual top-ups",
    });
  });

  it("creates admin top-ups on the selected user's active workspace", async () => {
    const result = (await billingRouterAny.adminManualTopUp({
      input: {
        targetUserId: "user-2",
        usdAmount: 25,
      },
      context: createContext(),
    })) as { id: string; creditsGranted: number };

    expect(getExistingBillingOwnerForUserMock).toHaveBeenCalledWith("user-2");
    expect(createManualTopUpMock).toHaveBeenCalledWith({
      owner: expect.objectContaining({
        ownerType: "workspace",
        ownerId: "ws-target",
      }),
      grantedByUserId: "user-1",
      usdAmount: 25,
    });
    expect(result).toEqual({
      id: "topup-1",
      creditsGranted: 2500,
      expiresAt: new Date("2027-03-09T00:00:00.000Z"),
    });
  });

  it("rejects admin top-ups when the target user has no active workspace", async () => {
    getExistingBillingOwnerForUserMock.mockResolvedValueOnce({
      targetUser: {
        id: "user-2",
        name: "Target User",
        email: "target@example.com",
      },
      activeWorkspace: null,
      owner: null,
    });

    await expect(
      billingRouterAny.adminManualTopUp({
        input: {
          targetUserId: "user-2",
          usdAmount: 25,
        },
        context: createContext(),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Selected user does not have an active workspace",
    });
  });
});
