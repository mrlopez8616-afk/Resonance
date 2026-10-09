import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const sourcePath = fileURLToPath(new URL("../../public/sw.js", import.meta.url));
const source = readFileSync(sourcePath, "utf8");

type Decision = "bypass" | "navigation" | "static";

type RouteInput = {
  pathname: string;
  method?: string;
  mode?: string;
  destination?: string;
  authorization?: boolean;
  range?: boolean;
};

function loadWorker() {
  const sandbox = {
    URL,
    Response,
    Promise,
    caches: {},
    fetch() {
      return Promise.reject(new Error("network"));
    },
    swRoute: undefined as ((input: RouteInput) => Decision) | undefined,
    shouldStore: undefined as
      | ((decision: Decision, headers: { get(name: string): string | null }) => boolean)
      | undefined,
    CACHE_NAME: undefined as string | undefined,
  };
  runInNewContext(source, sandbox, { filename: sourcePath });
  const { swRoute, shouldStore, CACHE_NAME } = sandbox;
  if (!swRoute || !shouldStore || !CACHE_NAME) {
    throw new Error("service worker did not expose swRoute and shouldStore");
  }
  return { swRoute, shouldStore, CACHE_NAME };
}

const worker = loadWorker();

function headers(values: Record<string, string>) {
  const lower = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (name: string) => lower.get(name.toLowerCase()) ?? null };
}

describe("service worker route rules", () => {
  it("leaves /api and authorized requests untouched", () => {
    assert.equal(worker.swRoute({ pathname: "/api", method: "GET" }), "bypass");
    assert.equal(worker.swRoute({ pathname: "/api/bets", method: "GET" }), "bypass");
    assert.equal(worker.swRoute({ pathname: "/api/finance/snapshot", method: "GET" }), "bypass");
    assert.equal(
      worker.swRoute({ pathname: "/api/finance/snapshot", method: "GET", mode: "navigate" }),
      "bypass",
    );
    assert.equal(
      worker.swRoute({ pathname: "/icons/icon-192.png", method: "GET", authorization: true }),
      "bypass",
    );
    assert.equal(worker.swRoute({ pathname: "/_next/static/chunks/app.js", method: "POST" }), "bypass");
    assert.equal(
      worker.swRoute({ pathname: "/_next/static/chunks/app.js", method: "GET", range: true }),
      "bypass",
    );
  });

  it("does not cache authenticated page navigations", () => {
    const pages = ["/", "/login", "/n/crypto", "/n/ai-stocks", "/n/crypto/xrp", "/calendar", "/n/fitness", "/settings/security"];
    for (const pathname of pages) {
      assert.equal(worker.swRoute({ pathname, method: "GET", mode: "navigate" }), "navigation");
      assert.equal(worker.shouldStore("navigation", headers({})), false);
    }
    assert.equal(
      worker.swRoute({ pathname: "/", method: "GET", destination: "document" }),
      "navigation",
    );
    assert.equal(worker.swRoute({ pathname: "/n/crypto", method: "GET", mode: "same-origin" }), "bypass");
  });

  it("stores only static assets, and never a Set-Cookie response", () => {
    assert.equal(worker.swRoute({ pathname: "/_next/static/chunks/app.js" }), "static");
    assert.equal(worker.swRoute({ pathname: "/icons/icon-512.png" }), "static");
    assert.equal(worker.swRoute({ pathname: "/icons/icon-maskable-512.png" }), "static");
    assert.equal(worker.swRoute({ pathname: "/manifest.webmanifest" }), "static");
    assert.equal(worker.swRoute({ pathname: "/offline.html" }), "static");
    assert.equal(worker.swRoute({ pathname: "/apple-touch-icon.png" }), "static");
    assert.equal(worker.shouldStore("static", headers({})), true);
    assert.equal(worker.shouldStore("static", headers({ "set-cookie": "__Host-resonance_session=abc" })), false);
    assert.equal(worker.shouldStore("bypass", headers({})), false);
    assert.equal(worker.swRoute({ pathname: "/n/crypto/xrp" }), "bypass");
    assert.equal(worker.swRoute({ pathname: "/api/spot-price" }), "bypass");
  });

  it("versions the cache and has no push handler", () => {
    assert.match(worker.CACHE_NAME, /^resonance-static-v\d+$/);
    assert.match(source, /caches\.delete/);
    assert.match(source, /You're offline\. Resonance needs a connection\./);
    assert.doesNotMatch(source, /pushManager|showNotification|addEventListener\(\s*["']push["']/);
    const navigation = source.slice(source.indexOf("async function networkNavigation"), source.indexOf("async function storeStatic"));
    assert.doesNotMatch(navigation, /cache\.put|caches\.open/);
  });
});
