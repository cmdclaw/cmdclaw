"use client";

import { authClient } from "@/lib/auth-client";
import { client } from "@/orpc/client";

type PushConfig = {
  supported: boolean;
  publicKey: string | null;
};

export type BrowserPushSetupResult =
  | "subscribed"
  | "unsupported"
  | "unauthenticated"
  | "permission-denied"
  | "config-unavailable"
  | "registration-unavailable";

type PushCapableServiceWorkerRegistration = ServiceWorkerRegistration & {
  pushManager: PushManager;
};

function supportsPushApi(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof window.Notification !== "undefined"
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (const [index, char] of Array.from(rawData).entries()) {
    outputArray[index] = char.charCodeAt(0);
  }

  return outputArray;
}

async function getPushConfig(): Promise<PushConfig | null> {
  try {
    return await client.notification.getPushConfig();
  } catch (error) {
    console.error("[Push] Failed to load push configuration", error);
    return null;
  }
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (error) {
    console.error("[Push] Failed to register service worker", error);
    return null;
  }
}

function asPushCapableRegistration(
  registration: ServiceWorkerRegistration | null,
): PushCapableServiceWorkerRegistration | null {
  if (!registration || !("pushManager" in registration)) {
    return null;
  }

  return registration as PushCapableServiceWorkerRegistration;
}

function toSubscriptionPayload(subscription: PushSubscriptionJSON) {
  if (!subscription.endpoint || !subscription.keys?.auth || !subscription.keys.p256dh) {
    return null;
  }

  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      auth: subscription.keys.auth,
      p256dh: subscription.keys.p256dh,
    },
  };
}

export async function setupBrowserPushNotifications(): Promise<BrowserPushSetupResult> {
  if (!supportsPushApi()) {
    return "unsupported";
  }

  const session = await authClient.getSession();
  if (!session?.data?.session || !session.data.user) {
    return "unauthenticated";
  }

  const permission =
    window.Notification.permission === "default"
      ? await window.Notification.requestPermission()
      : window.Notification.permission;

  if (permission !== "granted") {
    return "permission-denied";
  }

  const pushConfig = await getPushConfig();
  if (!pushConfig?.supported || !pushConfig.publicKey) {
    return "config-unavailable";
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return "registration-unavailable";
  }

  const pushRegistration = asPushCapableRegistration(registration);
  if (!pushRegistration) {
    return "registration-unavailable";
  }

  const existingSubscription = await pushRegistration.pushManager.getSubscription();
  if (existingSubscription) {
    const payload = toSubscriptionPayload(existingSubscription.toJSON());
    if (payload) {
      await client.notification.savePushSubscription(payload);
    }
    return "subscribed";
  }

  const subscription = await pushRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(pushConfig.publicKey),
  });

  const payload = toSubscriptionPayload(subscription.toJSON());
  if (!payload) {
    return "registration-unavailable";
  }

  await client.notification.savePushSubscription(payload);
  return "subscribed";
}

export async function unregisterBrowserPushSubscription(): Promise<void> {
  if (!supportsPushApi()) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const pushRegistration = asPushCapableRegistration(registration ?? null);
  const subscription = await pushRegistration?.pushManager.getSubscription();
  if (!subscription) {
    return;
  }

  await client.notification.deletePushSubscription({ endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
