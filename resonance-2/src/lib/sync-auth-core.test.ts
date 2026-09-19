import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorizeSyncAccess,
  readBearerToken,
  writeProtectionEnabled,
} from "./sync-auth-core";

describe("fill ingest auth", () => {
  it("is open when the sync secret is unset", () => {
    const result = authorizeSyncAccess({ syncSecret: null, bearer: null });
    assert.deepEqual(result, { ok: true, via: "open" });
    assert.equal(writeProtectionEnabled({}), false);
  });

  it("accepts a bearer sync secret", () => {
    const result = authorizeSyncAccess({
      syncSecret: "hub-secret",
      bearer: "hub-secret",
    });
    assert.deepEqual(result, { ok: true, via: "bearer-secret" });
  });

  it("rejects a wrong bearer when protection is on", () => {
    const result = authorizeSyncAccess({
      syncSecret: "hub-secret",
      bearer: "nope",
    });
    assert.equal(result.ok, false);
  });

  it("parses Bearer headers", () => {
    assert.equal(readBearerToken("Bearer abc.def"), "abc.def");
    assert.equal(readBearerToken("bearer abc"), "abc");
    assert.equal(readBearerToken("Basic x"), null);
  });
});
