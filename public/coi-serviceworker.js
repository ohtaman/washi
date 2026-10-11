/*!
 * coi-serviceworker for WaSHI Web Demo
 * Enables cross-origin isolation (COOP & COEP) on static hosting environments like GitHub Pages.
 */
if (typeof window === "undefined") {
  // === Service Worker Context ===
  self.addEventListener("install", () => {
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });

  self.addEventListener("fetch", (event) => {
    const r = event.request;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
      return;
    }

    event.respondWith(
      fetch(r).then((response) => {
        // Transparently pass through opaque responses or network redirects
        if (response.status === 0 || response.type === "opaqueredirect") {
          return response;
        }

        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
        newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      })
    );
  });
} else {
  // === Window / Page Context ===
  (() => {
    // 1. If cross-origin isolation is already established, clear reload record and do nothing
    if (window.crossOriginIsolated) {
      try {
        sessionStorage.removeItem("washi_coi_reload_attempted");
      } catch (_) {}
      return;
    }

    // 2. Validate secure context (HTTPS or localhost required by Service Workers & COOP/COEP)
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "[::1]";

    if (!window.isSecureContext && !isLocalhost) {
      console.warn("[WaSHI COI] Secure context (HTTPS or localhost) is required for cross-origin isolation.");
      window.__washi_coi_status = "insecure_context";
      return;
    }

    // 3. Check browser Service Worker capability
    if (!("serviceWorker" in navigator)) {
      console.warn("[WaSHI COI] Service Workers are not supported in this browser environment.");
      window.__washi_coi_status = "sw_unsupported";
      return;
    }

    // 4. Infinite Reload Guard: Halt if a reload was already attempted in this session
    let reloadAttempted = false;
    try {
      reloadAttempted = sessionStorage.getItem("washi_coi_reload_attempted") === "true";
    } catch (_) {}

    if (reloadAttempted) {
      console.warn(
        "[WaSHI COI] Page reload was already attempted, but window.crossOriginIsolated is still false. Halting reload loop."
      );
      window.__washi_coi_status = "failed_after_reload";
      return;
    }

    // 5. Determine script URL and scope
    // Constrain scope strictly to the demo's base directory (e.g. /washi/) to avoid affecting sibling sites on GitHub Pages
    const scriptTag = document.currentScript;
    const swUrl = (scriptTag && scriptTag.src) ? scriptTag.src : new URL("coi-serviceworker.js", window.location.href).href;
    const swScope = new URL("./", swUrl).pathname;

    let hasReloaded = false;
    const triggerControlledReload = () => {
      if (hasReloaded) return;
      hasReloaded = true;
      try {
        sessionStorage.setItem("washi_coi_reload_attempted", "true");
      } catch (_) {}
      window.location.reload();
    };

    // 6. Register the service worker
    navigator.serviceWorker
      .register(swUrl, { scope: swScope })
      .then((registration) => {
        // If registration is active but not controlling the document yet, reload
        if (registration.active && !navigator.serviceWorker.controller) {
          triggerControlledReload();
          return;
        }

        // If newly installing, wait for activation
        const sw = registration.installing || registration.waiting;
        if (sw) {
          sw.addEventListener("statechange", () => {
            if (sw.state === "activated" && !navigator.serviceWorker.controller) {
              triggerControlledReload();
            }
          });
        }
      })
      .catch((err) => {
        console.warn("[WaSHI COI] Failed to register service worker:", err);
        window.__washi_coi_status = "registration_failed";
      });

    // Also trigger reload once controller changes
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!window.crossOriginIsolated) {
        triggerControlledReload();
      }
    });
  })();
}
