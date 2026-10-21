import { BUCKLEY_EVENT_SLUG, BUCKLEY_EVENT_TITLE, isEdmontonAlias } from "@/lib/fight-event-alias";
import { sqlQuery } from "@/lib/pg/client";

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

function textField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

/**
 * The fight desk reads payload, not the text columns.
 * 035 updates the columns. This writes the same canonical event into the payload.
 * A second call updates 0 rows. Rows are not deleted.
 */
export async function patchEdmontonEventPayloads(): Promise<{
  bets: number;
  results: number;
  calendar: number;
}> {
  let bets = 0;
  const betRows = await sqlQuery<{ id: string; event: string; payload: unknown }>(
    `SELECT id, event, payload FROM bets`,
  );
  for (const row of betRows) {
    const payload = payloadObject(row.payload);
    if (!payload) continue;
    const event = textField(payload, "event");
    if (!isEdmontonAlias(event) && !isEdmontonAlias(row.event)) continue;
    if (event === BUCKLEY_EVENT_TITLE && row.event === BUCKLEY_EVENT_TITLE) continue;
    const next = { ...payload, event: BUCKLEY_EVENT_TITLE };
    const updated = await sqlQuery<{ id: string }>(
      `UPDATE bets
       SET event = $2, payload = $3::jsonb, updated_at = now()
       WHERE id = $1
         AND (event <> $2 OR coalesce(payload->>'event', '') <> $2)
       RETURNING id`,
      [row.id, BUCKLEY_EVENT_TITLE, JSON.stringify(next)],
    );
    bets += updated.length;
  }

  let results = 0;
  const resultRows = await sqlQuery<{ fight_slug: string; event: string; payload: unknown }>(
    `SELECT fight_slug, event, payload FROM fight_results`,
  );
  for (const row of resultRows) {
    const payload = payloadObject(row.payload);
    if (!payload) continue;
    const event = textField(payload, "event");
    if (!isEdmontonAlias(event) && !isEdmontonAlias(row.event)) continue;
    if (event === BUCKLEY_EVENT_SLUG && row.event === BUCKLEY_EVENT_SLUG) continue;
    const next = { ...payload, event: BUCKLEY_EVENT_SLUG };
    const updated = await sqlQuery<{ fight_slug: string }>(
      `UPDATE fight_results
       SET event = $2, payload = $3::jsonb, updated_at = now()
       WHERE fight_slug = $1
         AND (event <> $2 OR coalesce(payload->>'event', '') <> $2)
       RETURNING fight_slug`,
      [row.fight_slug, BUCKLEY_EVENT_SLUG, JSON.stringify(next)],
    );
    results += updated.length;
  }

  let calendar = 0;
  const calendarRows = await sqlQuery<{
    id: string;
    event_slug: string | null;
    title: string;
    payload: unknown;
  }>(`SELECT id, event_slug, title, payload FROM calendar_entries`);
  for (const row of calendarRows) {
    const payload = payloadObject(row.payload);
    if (!payload) continue;
    const slug = textField(payload, "eventSlug");
    const column = row.event_slug ?? "";
    if (!isEdmontonAlias(slug) && !isEdmontonAlias(column) && !isEdmontonAlias(row.title)) continue;
    if (slug === BUCKLEY_EVENT_SLUG && column === BUCKLEY_EVENT_SLUG) continue;
    const next = { ...payload, eventSlug: BUCKLEY_EVENT_SLUG };
    const updated = await sqlQuery<{ id: string }>(
      `UPDATE calendar_entries
       SET event_slug = $2, payload = $3::jsonb, updated_at = now()
       WHERE id = $1
         AND (
           coalesce(event_slug, '') <> $2
           OR coalesce(payload->>'eventSlug', '') <> $2
         )
       RETURNING id`,
      [row.id, BUCKLEY_EVENT_SLUG, JSON.stringify(next)],
    );
    calendar += updated.length;
  }

  console.log(
    `035_merge_edmonton_buckley: payload bets ${bets} results ${results} calendar ${calendar}`,
  );
  return { bets, results, calendar };
}
