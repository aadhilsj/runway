import { useEffect } from "react";

const LEGACY_CACHE_PREFIX = "runway-pwa-";

/** Removes the legacy app's service worker after the primary URL starts serving Runway 2. */
export function LegacyCacheRetirement() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations.map((registration) => registration.unregister()),
        ),
      )
      .then(async () => {
        if (!("caches" in window)) return;
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith(LEGACY_CACHE_PREFIX))
            .map((key) => caches.delete(key)),
        );
      })
      .catch(() => {
        /* Cache retirement must never block the workspace. */
      });
  }, []);
  return null;
}
