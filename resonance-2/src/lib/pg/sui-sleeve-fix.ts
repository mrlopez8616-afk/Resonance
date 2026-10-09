import { sqlQuery } from "@/lib/pg/client";

/** The unsleeved 2026-09-18 buy of 16.931 SUI. No other order is eligible. */
export const SUI_AGENTIC_BUY_ORDER = "6aad6b8e-f2a6-4be3-a803-65940a748d8d";

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

function namesThisOrder(externalId: string, payload: Record<string, unknown> | null): boolean {
  if (externalId === SUI_AGENTIC_BUY_ORDER) return true;
  if (externalId.endsWith(SUI_AGENTIC_BUY_ORDER)) return true;
  return payload?.orderId === SUI_AGENTIC_BUY_ORDER;
}

/**
 * Writes sleeve and venue into the payload of that one SUI buy.
 * The column update lives in 012. This runs in the same migrate step
 * because the log reads payload, not the sleeve column.
 * A second call updates 0 rows. Other null-sleeve rows are not selected.
 */
export async function patchSuiAgenticBuyPayload(): Promise<number> {
  const rows = await sqlQuery<{
    source: string;
    external_id: string;
    symbol: string;
    sleeve: string | null;
    payload: unknown;
  }>(
    `SELECT source, external_id, symbol, sleeve, payload
     FROM fills
     WHERE symbol = 'SUI'
       AND (
         external_id = $1
         OR external_id LIKE $2
         OR payload->>'orderId' = $1
       )`,
    [SUI_AGENTIC_BUY_ORDER, `%${SUI_AGENTIC_BUY_ORDER}`],
  );
  let changed = 0;
  for (const row of rows) {
    const payload = payloadObject(row.payload);
    if (row.symbol !== "SUI" || !namesThisOrder(row.external_id, payload)) continue;
    if (row.sleeve != null && row.sleeve !== SLEEVE) continue;
    if (!payload || payload.kind === "bet") continue;
    if (payload.sleeve != null && payload.sleeve !== "") continue;
    const next = { ...payload, sleeve: SLEEVE, venue: payload.venue ?? VENUE };
    const updated = await sqlQuery<{ external_id: string }>(
      `UPDATE fills
       SET sleeve = $4,
           venue = $5,
           payload = $3::jsonb
       WHERE source = $1
         AND external_id = $2
         AND symbol = 'SUI'
         AND (sleeve IS NULL OR sleeve = $4)
         AND (payload->>'orderId' = $6 OR external_id = $6 OR external_id LIKE $7)
         AND (payload->>'sleeve' IS NULL OR payload->>'sleeve' = '')
       RETURNING external_id`,
      [row.source, row.external_id, JSON.stringify(next), SLEEVE, VENUE, SUI_AGENTIC_BUY_ORDER, `%${SUI_AGENTIC_BUY_ORDER}`],
    );
    changed += updated.length;
  }
  console.log(`012_sui_agentic_sleeve: payload updated ${changed} row(s)`);
  return changed;
}
