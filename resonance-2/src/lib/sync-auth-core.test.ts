import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorizeFitnessAccess,
  authorizeSyncAccess,
  readAuthorizationCredential,
  readBearerToken,
  readIngestCredentials,
  readLooseToken,
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
    assert.deepEqual(
      authorizeFitnessAccess({ token: "phone-token", bearer: null, headerToken: null, resonanceToken: "phone-token" }),
      { ok: true },
    );
    assert.deepEqual(
      authorizeFitnessAccess({
        token: "phone-token",
        bearer: "hub-secret",
        presented: ["phone-token"],
      }),
      { ok: true },
    );
  });

  it("parses Bearer headers", () => {
    assert.equal(readBearerToken("Bearer abc.def"), "abc.def");
    assert.equal(readBearerToken("bearer abc"), "abc");
    assert.equal(readBearerToken("Basic x"), null);
    assert.equal(readAuthorizationCredential("Bearer abc.def"), "abc.def");
    assert.equal(readAuthorizationCredential("bearer   Bearer  abc"), "abc");
    assert.equal(readAuthorizationCredential("  plain-token  "), "plain-token");
    assert.equal(readAuthorizationCredential("Basic x"), null);
    assert.equal(readLooseToken(" Bearer phone-token "), "phone-token");
    assert.equal(readLooseToken("phone-token"), "phone-token");
  });

  it("reads ingest credentials without keeping header values in the name list", () => {
    const headers = new Headers();
    headers.set("Authorization", "Bearer secret-value");
    headers.set("X-Resonance-Token", "other-secret");
    const creds = readIngestCredentials(headers);
    assert.deepEqual(creds.headerNames, ["authorization", "x-resonance-token"]);
    assert.deepEqual(creds.tokens, ["secret-value", "other-secret"]);
    assert.equal(JSON.stringify(creds.headerNames).includes("secret-value"), false);
    assert.equal(JSON.stringify(creds.headerNames).includes("other-secret"), false);
  });
});
