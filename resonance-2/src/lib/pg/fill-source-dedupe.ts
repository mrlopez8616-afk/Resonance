import { sqlQuery } from "@/lib/pg/client";

/** The two re-tagged orders, in the external_id forms this store has used. */
export const RETAGGED_FILL_EXTERNAL_IDS = [
  "6aad6b7a-415a-4895-b43c-72c0eca79a55",
  "seed:6aad6b7a-415a-4895-b43c-72c0eca79a55",
  "6aad6b8e-f2a6-4be3-a803-65940a748d8d",
  "seed:6aad6b8e-f2a6-4be3-a803-65940a748d8d",
] as const;

const SLEEVE = "rh-agentic";
const VENUE = "robinhood";

function payloadObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Writes sleeve and venue into a kept robinhood payload that lacks them.
 * Column repairs live in 015. The log reads the payload.
 * A second call updates 0 rows. Other external ids are not selected.
 */
export async function patchRetaggedFillPayloads(): Promise<number> {
  const rows = await sqlQuery<{
    external_id: string;
    sleeve: string | null;
    venue: string | null;
    payload: unknown;
  }>(
    `SELECT external_id, sleeve, venue, payload
     FROM fills
     WHERE source = 'robinhood'
       AND external_id = ANY($1::text[])`,
    [RETAGGED_FILL_EXTERNAL_IDS],
  );
  let changed = 0;
  for (const row of rows) {
    const payload = payloadObject(row.payload);
    if (!payload || payload.kind === "bet") continue;
    const sleeveOk = row.sleeve === SLEEVE && payload.sleeve === SLEEVE;
    const venueOk = row.venue === VENUE && payload.venue === VENUE;
    if (sleeveOk && venueOk) continue;
    const next = { ...payload, sleeve: SLEEVE, venue: VENUE };
    const updated = await sqlQuery<{ external_id: string }>(
      `UPDATE fills
       SET sleeve = $3,
           venue = $4,
           payload = $2::jsonb
       WHERE source = 'robinhood'
         AND external_id = $1
         AND (
           sleeve IS DISTINCT FROM $3
           OR venue IS DISTINCT FROM $4
           OR payload->>'sleeve' IS DISTINCT FROM $3
           OR payload->>'venue' IS DISTINCT FROM $4
         )
       RETURNING external_id`,
      [row.external_id, JSON.stringify(next), SLEEVE, VENUE],
    );
    changed += updated.length;
  }
  console.log(`015_dedupe_retagged_fills: payload fixed ${changed} row(s)`);
  return changed;
}
