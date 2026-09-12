import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signGateToken } from "./app-gate-crypto";
import {
  authorizeSyncAccess,
  readBearerToken,
  readNamedCookie,
  writeProtectionEnabled,
} from "./sync-auth-core";

describe("decision sync auth", () => {
  it("is open when neither password nor sync secret is set", () => {
    const result = authorizeSyncAccess({
      password: null,
      syncSecret: null,
      bearer: null,
      cookieToken: null,
    });
    assert.deepEqual(result, { ok: true, via: "open" });
    assert.equal(writeProtectionEnabled({}), false);
  });

  it("accepts a bearer sync secret", () => {
    const result = authorizeSyncAccess({
      password: "site-password",
      syncSecret: "hub-secret",
      bearer: "hub-secret",
      cookieToken: null,
    });
    assert.deepEqual(result, { ok: true, via: "bearer-secret" });
  });

  it("accepts the site password as bearer", () => {
    const result = authorizeSyncAccess({
      password: "site-password",
      syncSecret: "hub-secret",
      bearer: "site-password",
      cookieToken: null,
    });
    assert.deepEqual(result, { ok: true, via: "bearer-password" });
  });

  it("accepts the httpOnly gate cookie", () => {
    const token = signGateToken("site-password", 1_000_000);
    const result = authorizeSyncAccess({
      password: "site-password",
      syncSecret: "hub-secret",
      bearer: null,
      cookieToken: token,
      now: 1_000_000,
    });
    assert.deepEqual(result, { ok: true, via: "cookie" });
  });

  it("rejects a wrong bearer when protection is on", () => {
    const result = authorizeSyncAccess({
      password: "site-password",
      syncSecret: "hub-secret",
      bearer: "nope",
      cookieToken: null,
    });
    assert.equal(result.ok, false);
  });

  it("parses bearer and cookie headers", () => {
    assert.equal(readBearerToken("Bearer abc.def"), "abc.def");
    assert.equal(readBearerToken("bearer abc"), "abc");
    assert.equal(readBearerToken("Basic x"), null);
    assert.equal(
      readNamedCookie("other=1; resonance_gate=tok.en; x=y"),
      "tok.en",
    );
  });
});
