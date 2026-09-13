import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { UNLOCK_AND_RETRY_MESSAGE } from "./api-client";
import {
  attestDecisionOnServer,
  mirrorDecisionOnXrplServer,
} from "./decisions-client-sync";
import type { Decision } from "./types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: Response) {
  globalThis.fetch = (async () => response) as typeof fetch;
}

function mockFetchThrow() {
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
}

const mirrored: Decision = {
  id: "D-2026-09-11-04",
  title: "D-04",
  status: "decided",
  attestationStatus: "hashgraph_attested",
  hederaMessageId: "0.0.10513997/1",
  fingerprint: "ab".repeat(32),
  xrplTxHash: "A".repeat(64),
  xrplMemoAt: "2026-09-13T03:00:00.000Z",
} as Decision;

describe("mirrorDecisionOnXrplServer client errors", () => {
  it("shows an unlock message when the gate returns HTML", async () => {
    mockFetch(
      new Response("<!DOCTYPE html><html><title>Unlock</title></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    const result = await mirrorDecisionOnXrplServer("D-2026-09-11-04");
    assert.equal(result.ok, false);
    assert.equal(result.message, UNLOCK_AND_RETRY_MESSAGE);
    assert.ok(!result.message.includes("Network error"));
  });

  it("shows the server error string for a JSON XRPL failure", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          ok: false,
          error: "XRPL Testnet websocket timed out (s.altnet.rippletest.net:51233).",
        }),
        { status: 502, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await mirrorDecisionOnXrplServer("D-2026-09-11-04");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 502);
      assert.equal(
        result.message,
        "XRPL Testnet websocket timed out (s.altnet.rippletest.net:51233).",
      );
    }
  });

  it("stores the mirrored hash on the happy path", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          ok: true,
          decision: mirrored,
          xrpl: { txHash: mirrored.xrplTxHash, explorerUrl: "https://testnet.xrpl.org/transactions/aaa" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await mirrorDecisionOnXrplServer("D-2026-09-11-04");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.txHash, mirrored.xrplTxHash);
      assert.equal(result.decision.xrplTxHash, mirrored.xrplTxHash);
    }
  });

  it("reserves the network catch-all for a thrown fetch", async () => {
    mockFetchThrow();
    const result = await mirrorDecisionOnXrplServer("D-2026-09-11-04");
    assert.equal(result.ok, false);
    assert.equal(result.message, "Network error talking to the XRPL mirror endpoint.");
  });
});

describe("attestDecisionOnServer client errors", () => {
  it("shows an unlock message when the gate returns HTML", async () => {
    mockFetch(
      new Response("<html><body>Unlock Resonance</body></html>", {
        status: 307,
        headers: { "content-type": "text/html", location: "/unlock" },
      }),
    );
    const result = await attestDecisionOnServer("D-2026-09-11-04");
    assert.equal(result.ok, false);
    assert.equal(result.message, UNLOCK_AND_RETRY_MESSAGE);
    assert.ok(!result.message.includes("Network error"));
  });
});
