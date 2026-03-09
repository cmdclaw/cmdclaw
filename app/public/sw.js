self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const hasVisibleClient = windowClients.some(
        (client) => client.visibilityState === "visible" || client.focused,
      );

      if (hasVisibleClient) {
        return;
      }

      await self.registration.showNotification(payload.title || "CmdClaw", {
        body: payload.body || "Your task is complete.",
        tag: payload.tag || "cmdclaw-task-done",
        data: {
          url: payload.url || "/chat",
        },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const targetUrl = event.notification.data?.url || "/chat";
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const firstClient = windowClients.find((client) => "focus" in client);
      if (firstClient) {
        await firstClient.focus();
        if ("navigate" in firstClient) {
          await firstClient.navigate(targetUrl);
        }
        return;
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});
