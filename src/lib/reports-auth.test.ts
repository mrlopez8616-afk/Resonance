import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDecisionSyncApi, shouldBypassAppGate } from "./app-gate-paths";
import { authorizeSyncAccess } from "./sync-auth-core";

describe("reports file + attest auth", () => {
  it("uses the same Bearer / cookie gate as Decisions", () => {
    assert.equal(isDecisionSyncApi("/api/reports"), true);
    assert.equal(isDecisionSyncApi("/api/attest"), true);
    assert.equal(shouldBypassAppGate("/api/reports"), true);
    assert.equal(shouldBypassAppGate("/api/attest"), true);

    const denied = authorizeSyncAccess({
      password: "site-password",
      syncSecret: "hub-secret",
      bearer: null,
      cookieToken: null,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.match(denied.error, /Unlock the site|Bearer/);
    }

    const hub = authorizeSyncAccess({
      password: "site-password",
      syncSecret: "hub-secret",
      bearer: "hub-secret",
      cookieToken: null,
    });
    assert.deepEqual(hub, { ok: true, via: "bearer-secret" });

    const wrong = authorizeSyncAccess({
      password: "site-password",
      syncSecret: "hub-secret",
      bearer: "nope",
      cookieToken: null,
    });
    assert.equal(wrong.ok, false);
  });
});
