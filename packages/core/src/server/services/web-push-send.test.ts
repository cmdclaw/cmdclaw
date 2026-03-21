import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, sendNotificationMock, setVapidDetailsMock } = vi.hoisted(() => ({
  dbMock: {
    query: {
      user: {
        findFirst: vi.fn(),
      },
      webPushSubscription: {
        findMany: vi.fn(),
      },
    },
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },
  sendNotificationMock: vi.fn(),
  setVapidDetailsMock: vi.fn(),
}));

vi.mock("@cmdclaw/db/client", () => ({
  db: dbMock,
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: setVapidDetailsMock,
    sendNotification: sendNotificationMock,
  },
}));

vi.mock("../../env", () => ({
  env: {
    WEB_PUSH_VAPID_SUBJECT: "mailto:test@example.com",
    WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
    WEB_PUSH_VAPID_PRIVATE_KEY: "private-key",
  },
}));

import { sendTaskDonePush } from "./web-push-service";

describe("sendTaskDonePush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not send notifications when the user has the setting disabled", async () => {
    dbMock.query.user.findFirst.mockResolvedValueOnce({ taskDonePushEnabled: false });

    await sendTaskDonePush({
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "message-1",
      content: "Task finished",
    });

    expect(dbMock.query.webPushSubscription.findMany).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("sends notifications when the user has the setting enabled", async () => {
    dbMock.query.user.findFirst.mockResolvedValueOnce({ taskDonePushEnabled: true });
    dbMock.query.webPushSubscription.findMany.mockResolvedValueOnce([
      {
        endpoint: "https://push.example.com/subscription",
        expirationTime: null,
        auth: "auth-key",
        p256dh: "p256dh-key",
      },
    ]);

    await sendTaskDonePush({
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "message-1",
      content: "Task finished",
    });

    expect(dbMock.query.webPushSubscription.findMany).toHaveBeenCalledOnce();
    expect(sendNotificationMock).toHaveBeenCalledOnce();
  });
});
