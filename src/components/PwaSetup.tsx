"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker and manages local notification permission.
 *
 * Notifications here are shown by the page itself rather than pushed from a
 * server. Real web-push needs VAPID keys and a server that stays awake — this
 * build runs on the student's own machine, so a push server would be a fiction.
 * Showing alerts through the service worker while the app is open is honest and
 * still useful, and the worker is already in place for real push later.
 */
export default function PwaSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registration failures are non-fatal — the app works fine without it.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}

export type NotifyPermission = "default" | "granted" | "denied" | "unsupported";

export function useNotifications() {
  const [permission, setPermission] = useState<NotifyPermission>("unsupported");

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission as NotifyPermission);
  }, []);

  async function request(): Promise<NotifyPermission> {
    if (typeof Notification === "undefined") return "unsupported";
    const result = (await Notification.requestPermission()) as NotifyPermission;
    setPermission(result);
    return result;
  }

  async function show(title: string, body: string, tag?: string) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    // Route through the service worker when available: notifications shown that
    // way survive the tab being backgrounded and support click-to-focus.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      reg.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag,
        data: { url: "/dashboard" },
      });
      return;
    }
    new Notification(title, { body, icon: "/icon-192.png", tag });
  }

  return { permission, request, show };
}
