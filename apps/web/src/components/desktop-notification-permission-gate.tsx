"use client";

import { useEffect } from "react";
import { setupBrowserPushNotifications } from "@/lib/browser-push";

export function DesktopNotificationPermissionGate() {
  useEffect(() => {
    const requestPermission = () => {
      void setupBrowserPushNotifications();
    };

    window.addEventListener("pointerdown", requestPermission, {
      capture: true,
      once: true,
    });
    window.addEventListener("keydown", requestPermission, {
      capture: true,
      once: true,
    });

    return () => {
      window.removeEventListener("pointerdown", requestPermission, true);
      window.removeEventListener("keydown", requestPermission, true);
    };
  }, []);

  return null;
}
