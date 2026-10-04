/**
 * Post one UFC 332 fight result. Does not settle the bet.
 * Live host requires RESONANCE_SYNC_SECRET. The secret stays off the client.
 *
 *   RESONANCE_SYNC_SECRET=... npm run fights:result -- \
 *     esteban-ribovics-vs-king-green "Esteban Ribovics" "KO/TKO" 1 1:01
 */
import { parseFightResult } from "../src/lib/fight-results";

function resultsUrl(): string {
  return (
    process.env.FIGHT_RESULTS_URL?.trim() || "https://resonance3.vercel.app/api/fights/result"
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const [fightSlug = "", winner = "", method = "", roundText = "", time = ""] = argv;
  if (!fightSlug || !winner || !method || !roundText || !time) {
    console.error(
      'Usage: npm run fights:result -- <fightSlug> "<winner>" "<method>" <round> <time>',
    );
    process.exit(1);
  }
  const round = Number(roundText);
  let result: ReturnType<typeof parseFightResult>;
  try {
    result = parseFightResult({
      event: "ufc-332",
      fightSlug,
      winner,
      method,
      round,
      time,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const secret = process.env.RESONANCE_SYNC_SECRET?.trim() ?? "";
  const url = resultsUrl();
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    console.error("FIGHT_RESULTS_URL must be an absolute URL.");
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
    body: JSON.stringify(result),
  });
  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exit(1);
}

void main();
