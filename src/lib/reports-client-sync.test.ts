import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { UNLOCK_AND_RETRY_MESSAGE } from "./api-client";
import { fileReportOnServer } from "./reports-client-sync";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fileReportOnServer client errors", () => {
  it("shows an unlock message when the gate returns HTML", async () => {
    globalThis.fetch = (async () =>
      new Response("<!DOCTYPE html><html><title>Unlock</title></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as typeof fetch;
    const result = await fileReportOnServer({
      title: "Daily Resonance Brief",
      kind: "brief",
      body: "paste",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.message, UNLOCK_AND_RETRY_MESSAGE);
    }
  });

  it("surfaces a 401 JSON error from the reports route", async () => {
    globalThis.fetch = (async () =>
      Response.json(
        {
          ok: false,
          error:
            "Unlock the site or send Authorization: Bearer <RESONANCE_SYNC_SECRET or RESONANCE_APP_PASSWORD>.",
        },
        { status: 401 },
      )) as typeof fetch;
    const result = await fileReportOnServer({
      title: "Daily Resonance Brief",
      kind: "brief",
      body: "paste",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.match(result.message, /Unlock the site|Bearer/);
    }
  });
});
