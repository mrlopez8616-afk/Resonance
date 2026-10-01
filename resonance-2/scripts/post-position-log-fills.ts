import { POSITION_LOG_FILLS } from "../src/data/position-log-fills";

/**
 * POST the confirmed HBAR / XLM Agentic fills through /api/fills.
 *
 * Those order ids are already the typed position seeds (7809.65 HBAR,
 * cost basis $847.11, and 0 XLM after the 2026-10-01 sell). After this
 * code is deployed, ingest writes the log row and does not move the
 * sleeve. A second POST is a no-op.
 *
 * Do not run this against a host that still applies every HBAR/XLM buy.
 * That host would double the position. The fills-store read path inserts
 * the same rows on deploy; this script is the hub retry of that ingest.
 *
 *   RESONANCE_SYNC_SECRET=... npm run fills:log
 */
function fillsUrl(): string {
  return process.env.FILLS_URL?.trim() || "https://resonance3.vercel.app/api/fills";
}

async function postFill(body: unknown): Promise<void> {
  const secret = process.env.RESONANCE_SYNC_SECRET?.trim() ?? "";
  const url = fillsUrl();
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    console.error("FILLS_URL must be an absolute URL.");
    process.exit(1);
  }
  if (!secret && host.endsWith("vercel.app")) {
    console.error(
      "Set RESONANCE_SYNC_SECRET. It is the same Bearer as POST /api/fills. Do not prefix it with NEXT_PUBLIC_.",
    );
    process.exit(1);
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret) headers.authorization = `Bearer ${secret}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exit(1);
  const payload = JSON.parse(text) as { applied?: boolean };
  if (payload.applied === true) {
    console.error(
      "Ingest applied a sleeve delta for a position-log fill. Stop. This host is not reconciling those order ids.",
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  for (const row of POSITION_LOG_FILLS) {
    await postFill({
      venue: row.venue,
      orderId: row.orderId,
      ticker: row.ticker,
      side: row.side,
      qty: row.qty,
      price: row.price,
      sleeve: row.sleeve,
      filledAt: row.filledAt,
      result: row.result,
    });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
