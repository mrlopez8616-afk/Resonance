import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorizeFitnessAccess,
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

  it("fails closed for fitness ingest unless the phone token matches", () => {
    assert.deepEqual(authorizeFitnessAccess({ token: null, bearer: "phone", headerToken: null }), {
      ok: false,
      status: 503,
      error: "Fitness ingest is not configured.",
    });
    assert.equal(
      authorizeFitnessAccess({ token: "phone-token", bearer: "hub-secret", headerToken: null }).ok,
      false,
    );
    assert.deepEqual(
      authorizeFitnessAccess({ token: "phone-token", bearer: "phone-token", headerToken: null }),
      { ok: true },
    );
    assert.deepEqual(
      authorizeFitnessAccess({ token: "phone-token", bearer: null, headerToken: "phone-token" }),
      { ok: true },
    );
  });

  it("parses Bearer headers", () => {
    assert.equal(readBearerToken("Bearer abc.def"), "abc.def");
    assert.equal(readBearerToken("bearer abc"), "abc");
    assert.equal(readBearerToken("Basic x"), null);
  });
});
