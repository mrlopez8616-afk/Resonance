/**
 * Settle one Coinbase Predict bet.
 * Live host requires RESONANCE_SYNC_SECRET. The secret stays off the client.
 *
 *   RESONANCE_SYNC_SECRET=... npm run bets:settle -- ufc-332-nolan won
 *   RESONANCE_SYNC_SECRET=... npm run bets:settle -- ufc-332-coria won --payout 42.51
 *   RESONANCE_SYNC_SECRET=... npm run bets:settle -- ufc-332-ribovics sold --payout 13.64 --stake 14.54 --override
 */
import { parseSettleRequest } from "../src/lib/bets";

function betsUrl(): string {
  return process.env.BETS_URL?.trim() || "https://resonance3.vercel.app/api/bets/settle";
}

function readFlag(argv: string[], name: string): string {
  const index = argv.indexOf(name);
  if (index === -1) return "";
  return argv[index + 1]?.trim() ?? "";
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const id = argv[0]?.trim() ?? "";
  const status = argv[1]?.trim() ?? "";
  const payout = readFlag(argv, "--payout");
  const stake = readFlag(argv, "--stake");
  const settledAt = readFlag(argv, "--settledAt");
  const override = argv.includes("--override");
  if (!id || !status) {
    console.error(
      "Usage: npm run bets:settle -- <id> <won|lost|void|sold> [--payout 12.34] [--stake 19.99 --override] [--settledAt 2026-10-03T23:00:00-05:00]",
    );
    process.exit(1);
  }

  let request: ReturnType<typeof parseSettleRequest>;
  try {
    request = parseSettleRequest({
      id,
      status,
      ...(payout ? { payout } : {}),
      ...(stake ? { stake } : {}),
      ...(settledAt ? { settledAt } : {}),
      ...(override ? { override: true } : {}),
    });
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
      "Set RESONANCE_SYNC_SECRET. It is the same Bearer as POST /api/calendar. Do not prefix it with NEXT_PUBLIC_.",
    );
    process.exit(1);
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) headers.authorization = `Bearer ${secret}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });
  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exit(1);
}

void main();
