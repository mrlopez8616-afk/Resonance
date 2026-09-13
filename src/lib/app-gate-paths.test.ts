import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isApiPath,
  isDecisionSyncApi,
  shouldBypassAppGate,
} from "./app-gate-paths";

describe("app gate path rules", () => {
  it("lets Decision sync APIs through so they can return JSON 401", () => {
    assert.equal(isDecisionSyncApi("/api/attest"), true);
    assert.equal(isDecisionSyncApi("/api/xrpl-mirror"), true);
    assert.equal(isDecisionSyncApi("/api/xrpl-mirror/"), true);
    assert.equal(isDecisionSyncApi("/api/decisions"), true);
    assert.equal(isDecisionSyncApi("/api/ack"), true);
    assert.equal(isDecisionSyncApi("/api/todos"), true);
    assert.equal(isDecisionSyncApi("/api/reports"), true);
    assert.equal(isDecisionSyncApi("/api/reports/"), true);
    assert.equal(shouldBypassAppGate("/api/xrpl-mirror"), true);
    assert.equal(shouldBypassAppGate("/api/reports"), true);
    assert.equal(shouldBypassAppGate("/api/health"), true);
  });

  it("does not treat page routes or other APIs as Decision sync", () => {
    assert.equal(isDecisionSyncApi("/api/prices"), false);
    assert.equal(isDecisionSyncApi("/decisions"), false);
    assert.equal(isDecisionSyncApi("/api/gate"), false);
    assert.equal(shouldBypassAppGate("/decisions"), false);
    assert.equal(shouldBypassAppGate("/health"), false);
    assert.equal(shouldBypassAppGate("/todos"), false);
    assert.equal(shouldBypassAppGate("/reports"), false);
    assert.equal(isDecisionSyncApi("/reports"), false);
    assert.equal(shouldBypassAppGate("/api/prices"), false);
    assert.equal(isApiPath("/api/prices"), true);
    assert.equal(isApiPath("/unlock"), false);
  });
});
