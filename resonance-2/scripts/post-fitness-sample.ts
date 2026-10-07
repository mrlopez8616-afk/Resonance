/**
 * POST one Health Auto Export sample at the fitness ingest route.
 *
 *   FITNESS_INGEST_TOKEN=... npm run fitness:sample
 *
 *   curl -sS -X POST https://resonance3.vercel.app/api/fitness/ingest \
 *     -H "Authorization: Bearer $FITNESS_INGEST_TOKEN" \
 *     -H "content-type: application/json" \
 *     -d @metrics.json
 *
 * The same token may be sent as `X-Fitness-Token` instead of Bearer.
 * Re-posting the same day or workout id updates the row.
 */
import { sampleMetricsBody, sampleWorkoutsBody } from "../src/lib/fitness-sample";

function endpoint(): string {
  const base = process.env.RESONANCE_BASE_URL?.trim() || "https://resonance3.vercel.app";
  return `${base.replace(/\/$/, "")}/api/fitness/ingest`;
}

async function post(body: unknown, token: string): Promise<void> {
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  console.log(response.status, text);
  if (!response.ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  const token = process.env.FITNESS_INGEST_TOKEN?.trim() ?? "";
  if (!token) {
    console.error("FITNESS_INGEST_TOKEN is not set.");
    process.exit(1);
  }
  await post(sampleMetricsBody, token);
  await post(sampleWorkoutsBody, token);
}

void main();
