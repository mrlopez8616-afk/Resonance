import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorizeFitnessAccess,
  authorizeSyncAccess,
  INGEST_AUTH_HEADER_NAMES,
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
    assert.equal(readBearerToken("Token abc"), null);
    assert.equal(readBearerToken("plain-token"), null);
    assert.equal(readAuthorizationCredential("Bearer abc.def"), "abc.def");
    assert.equal(readAuthorizationCredential("bearer   Bearer  abc"), "abc");
    assert.equal(readAuthorizationCredential("Token abc.def"), "abc.def");
    assert.equal(readAuthorizationCredential("token   secret"), "secret");
    assert.equal(readAuthorizationCredential("TOKEN Bearer secret"), "secret");
    assert.equal(readAuthorizationCredential("Bearer Token secret"), "secret");
    assert.equal(readAuthorizationCredential("  plain-token  "), "plain-token");
    assert.equal(readAuthorizationCredential("Basic x"), null);
    assert.equal(readAuthorizationCredential("Digest abc"), null);
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

  it("accepts the extra ingest header names and the Token scheme", () => {
    const secret = "phone-token";
    for (const name of INGEST_AUTH_HEADER_NAMES) {
      const headers = new Headers();
      headers.set(name, name === "authorization" ? `Token ${secret}` : secret);
      const creds = readIngestCredentials(headers);
      assert.deepEqual(creds.headerNames, [name]);
      assert.deepEqual(creds.tokens, [secret]);
      assert.equal(JSON.stringify(creds.headerNames).includes(secret), false);
      assert.deepEqual(authorizeFitnessAccess({ token: secret, presented: creds.tokens }), { ok: true });
    }
    const basic = readIngestCredentials(new Headers({ authorization: `Basic ${secret}` }));
    assert.deepEqual(basic.headerNames, ["authorization"]);
    assert.deepEqual(basic.tokens, []);
    assert.equal(authorizeFitnessAccess({ token: secret, presented: basic.tokens }).ok, false);
    const hub = readIngestCredentials(new Headers({ "x-api-key": "hub-secret" }));
    assert.equal(authorizeFitnessAccess({ token: secret, presented: hub.tokens }).ok, false);
    assert.equal(JSON.stringify(hub.headerNames).includes("hub-secret"), false);
  });
});
