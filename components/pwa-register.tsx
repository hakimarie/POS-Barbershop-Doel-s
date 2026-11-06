"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (cancelled) return;
        await registration.update().catch(() => {});
      } catch (error) {
        // PWA enhancement must never prevent the POS from loading.
        console.error("PWA service worker registration failed", error);
      }
    };

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}