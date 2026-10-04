/**
 * Append one Coinbase Predict bet, or a JSON file of bets.
 * Live host requires RESONANCE_SYNC_SECRET. The secret stays off the client.
 * Re-posting the same orderId is a no-op. The stored row is not rewritten.
 *
 *   RESONANCE_SYNC_SECRET=... npm run bets:post -- ticket.json
 *
 *   curl -sS -X POST https://resonance3.vercel.app/api/bets \
 *     -H "Authorization: Bearer $RESONANCE_SYNC_SECRET" \
 *     -H "content-type: application/json" \
 *     -d @ticket.json
 */
import { readFileSync } from "node:fs";
import { parseBetPostBody } from "../src/lib/bets";

function betsUrl(): string {
  return process.env.BETS_URL?.trim() || "https://resonance3.vercel.app/api/bets";
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const file = argv[0]?.trim() ?? "";
  if (!file) {
    console.error("Usage: npm run bets:post -- <bet.json>");
    process.exit(1);
  }

  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
    parseBetPostBody(body);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const secret = process.env.RESONANCE_SYNC_SECRET?.trim() ?? "";
  const url = betsUrl();
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    console.error("BETS_URL must be an absolute URL.");
    process.exit(1);
  }
  if (!secret && host.endsWith("vercel.app")) {
    console.error(
      "Set RESONANCE_SYNC_SECRET. It is the same Bearer as POST /api/bets/settle. Do not prefix it with NEXT_PUBLIC_.",
    );
    process.exit(1);
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers.authorization = `Bearer ${secret}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  console.log(responseText);
  if (!response.ok) process.exit(1);
}

void main();
