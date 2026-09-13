import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  UNLOCK_AND_RETRY_MESSAGE,
  explainNonJsonApiResponse,
  messageFromApiFailure,
  readApiJson,
} from "./api-client";

describe("non-JSON API responses", () => {
  it("asks to unlock when the gate redirected to HTML", () => {
    assert.equal(
      explainNonJsonApiResponse({
        status: 200,
        url: "https://example.test/unlock?next=%2Fapi%2Fxrpl-mirror",
        redirected: true,
        contentType: "text/html; charset=utf-8",
        bodyText: "<!DOCTYPE html><html><title>Unlock</title></html>",
        fallback: "Could not mirror this decision on XRPL Testnet.",
      }),
      UNLOCK_AND_RETRY_MESSAGE,
    );
  });

  it("asks to unlock on an HTTP 307 to /unlock", () => {
    assert.equal(
      explainNonJsonApiResponse({
        status: 307,
        url: "https://example.test/api/xrpl-mirror",
        redirected: false,
        contentType: "text/plain",
        bodyText: "Redirecting...",
        fallback: "Could not mirror this decision on XRPL Testnet.",
      }),
      UNLOCK_AND_RETRY_MESSAGE,
    );
  });

  it("includes HTTP status and a truncated body hint for other non-JSON failures", () => {
    const message = explainNonJsonApiResponse({
      status: 504,
      contentType: "text/plain",
      bodyText: "FUNCTION_INVOCATION_TIMEOUT ".repeat(20),
      fallback: "Could not mirror this decision on XRPL Testnet.",
    });
    assert.match(message, /HTTP 504/);
    assert.match(message, /FUNCTION_INVOCATION_TIMEOUT/);
    assert.ok(!message.includes("Network error"));
    assert.ok(message.length < 220);
  });

  it("uses the unlock copy for a bare 401", () => {
    assert.equal(
      messageFromApiFailure(401, undefined, "Could not mirror."),
      UNLOCK_AND_RETRY_MESSAGE,
    );
    assert.equal(
      messageFromApiFailure(502, "XRPL Testnet websocket timed out (s.altnet.rippletest.net:51233).", "Could not mirror."),
      "XRPL Testnet websocket timed out (s.altnet.rippletest.net:51233).",
    );
  });
});

describe("readApiJson", () => {
  it("parses a JSON error body", async () => {
    const response = new Response(JSON.stringify({ error: "Need hederaMessageId first." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
    const parsed = await readApiJson<{ error?: string }>(response, "fallback");
    assert.equal(parsed.parsed, true);
    if (parsed.parsed) {
      assert.equal(parsed.body.error, "Need hederaMessageId first.");
    }
  });

  it("does not treat HTML as a network failure", async () => {
    const response = new Response("<html><body>Unlock</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    const parsed = await readApiJson(response, "Could not mirror this decision on XRPL Testnet.");
    assert.equal(parsed.parsed, false);
    if (!parsed.parsed) {
      assert.equal(parsed.message, UNLOCK_AND_RETRY_MESSAGE);
    }
  });
});
