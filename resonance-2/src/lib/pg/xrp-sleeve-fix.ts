import { sqlQuery } from "@/lib/pg/client";

/** The unsleeved 2026-09-18 sell of 10 XRP. No other order is eligible. */
export const XRP_AGENTIC_SELL_ORDER = "6aad6b7a-415a-4895-b43c-72c0eca79a55";

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
  if (externalId === XRP_AGENTIC_SELL_ORDER) return true;
  if (externalId.endsWith(XRP_AGENTIC_SELL_ORDER)) return true;
  return payload?.orderId === XRP_AGENTIC_SELL_ORDER;
}

/**
 * Writes sleeve and venue into the payload of that one XRP sell.
 * The column update lives in 011. This runs in the same migrate step
 * because the log reads payload, not the sleeve column.
 * A second call updates 0 rows. Other null-sleeve rows are not selected.
 */
export async function patchXrpAgenticSellPayload(): Promise<number> {
  const rows = await sqlQuery<{
    source: string;
    external_id: string;
    symbol: string;
    sleeve: string | null;
    payload: unknown;
  }>(
    `SELECT source, external_id, symbol, sleeve, payload
     FROM fills
     WHERE symbol = 'XRP'
       AND (
         external_id = $1
         OR external_id LIKE $2
         OR payload->>'orderId' = $1
       )`,
    [XRP_AGENTIC_SELL_ORDER, `%${XRP_AGENTIC_SELL_ORDER}`],
  );
  let changed = 0;
  for (const row of rows) {
    const payload = payloadObject(row.payload);
    if (row.symbol !== "XRP" || !namesThisOrder(row.external_id, payload)) continue;
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
         AND symbol = 'XRP'
         AND (sleeve IS NULL OR sleeve = $4)
         AND (payload->>'orderId' = $6 OR external_id = $6 OR external_id LIKE $7)
         AND (payload->>'sleeve' IS NULL OR payload->>'sleeve' = '')
       RETURNING external_id`,
      [row.source, row.external_id, JSON.stringify(next), SLEEVE, VENUE, XRP_AGENTIC_SELL_ORDER, `%${XRP_AGENTIC_SELL_ORDER}`],
    );
    changed += updated.length;
  }
  console.log(`011_xrp_agentic_sleeve: payload updated ${changed} row(s)`);
  return changed;
}
