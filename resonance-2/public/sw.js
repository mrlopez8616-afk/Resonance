/**
 * Resonance service worker.
 *
 * Cache only static build assets (/_next/static, icons, manifest) and the
 * offline page. Navigations are network-first and are never stored. /api,
 * anything with Authorization, and any response that sets a cookie are never
 * stored. Authenticated HTML stays on the network; the offline page is the
 * fallback only when that navigation fails.
 *
 * Bump CACHE_NAME when the precache list changes. Activate deletes every
 * other cache.
 */
var CACHE_NAME = "resonance-static-v1";

const PRECACHE_URLS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/mark.svg",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isStaticAsset(pathname) {
  if (pathname.startsWith("/_next/static/")) return true;
  if (pathname.startsWith("/icons/")) return true;
  if (pathname === "/manifest.webmanifest" || pathname === "/manifest.json") return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/apple-touch-icon.png") return true;
  if (pathname === "/offline.html") return true;
  return false;
}

/**
 * @returns {"bypass" | "navigation" | "static"}
 * navigation: network only, offline page on failure, never stored.
 * static: may be stored when the response has no Set-Cookie.
 * bypass: the worker does not touch the request. /api and Authorization land here.
 */
function swRoute(input) {
  const method = String(input.method || "GET").toUpperCase();
  const pathname = typeof input.pathname === "string" ? input.pathname : "/";
  if (method !== "GET") return "bypass";
  if (input.authorization) return "bypass";
  if (input.range) return "bypass";
  if (isApiPath(pathname)) return "bypass";
  if (input.mode === "navigate" || input.destination === "document") return "navigation";
  if (isStaticAsset(pathname)) return "static";
  return "bypass";
}

/** Only a successful static response without Set-Cookie may enter the cache. */
function shouldStore(decision, headers) {
  if (decision !== "static") return false;
  if (!headers || typeof headers.get !== "function") return false;
  if (headers.get("set-cookie")) return false;
  return true;
}

async function networkNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match("/offline.html");
    if (cached) return cached;
    return new Response("You're offline. Resonance needs a connection.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function storeStatic(cache, request, response) {
  if (!response || !response.ok || response.type !== "basic" || response.redirected) return;
  if (!shouldStore("static", response.headers)) return;
  await cache.put(request, response.clone());
}

async function staticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    await storeStatic(cache, request, response);
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

function installWorker() {
  if (typeof ServiceWorkerGlobalScope === "undefined") return;

  self.addEventListener("install", (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
        )
        .then(() => self.clients.claim()),
    );
  });

  self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    const decision = swRoute({
      pathname: url.pathname,
      method: request.method,
      mode: request.mode,
      destination: request.destination,
      authorization: request.headers.has("authorization"),
      range: request.headers.has("range"),
    });

    if (decision === "bypass") return;
    if (decision === "navigation") {
      event.respondWith(networkNavigation(request));
      return;
    }
    event.respondWith(staticAsset(request));
  });
}

installWorker();
