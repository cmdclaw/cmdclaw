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
var getBillingOverviewForUserMock: ReturnType<typeof vi.fn>;
var getWorkspaceMembershipForUserMock: ReturnType<typeof vi.fn>;
var openBillingPortalForOwnerMock: ReturnType<typeof vi.fn>;
var cancelPlanForOwnerMock: ReturnType<typeof vi.fn>;

vi.mock("../middleware", () => ({
  protectedProcedure: createProcedureStub(),
}));

vi.mock("@/server/billing/service", () => ({
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
  ensureWorkspaceForUser: (() => {
    ensureWorkspaceForUserMock = vi.fn();
    return ensureWorkspaceForUserMock;
  })(),
  getBillingOverviewForUser: (() => {
    getBillingOverviewForUserMock = vi.fn();
    return getBillingOverviewForUserMock;
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

function createContext() {
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
            role: "admin",
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
  });

  it("ignores personal ownerType input and resolves the workspace owner", async () => {
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
});
