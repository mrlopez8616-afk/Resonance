import "server-only";

import { sqlQuery } from "@/lib/pg/client";
import {
  buildLiveGraph,
  liveEdgeSet,
  mapBuildPulse,
  mapCalendarPulse,
  mapFillPulse,
  mapFinancePulse,
  selectLiveEvents,
  type SystemPulse,
} from "@/lib/system-live";

const EDGES = liveEdgeSet(buildLiveGraph());

function iso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function dayKey(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text(value));
  return match?.[1] ?? "";
}

function intOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

async function fillPulses(since: string | null): Promise<SystemPulse[]> {
  const rows = await sqlQuery<{
    source: string;
    sleeve: string | null;
    symbol: string;
    created_at: Date | string;
    external_id: string;
    venue: string | null;
  }>(
    `SELECT source, sleeve, symbol, venue, created_at, external_id
     FROM fills
     WHERE ($1::timestamptz IS NULL OR created_at > $1::timestamptz)
     ORDER BY created_at DESC
     LIMIT 8`,
    [since],
  );
  const pulses: SystemPulse[] = [];
  for (const row of rows) {
    const at = iso(row.created_at);
    if (!at) continue;
    const pulse = mapFillPulse(
      {
        source: text(row.source),
        venue: row.venue,
        sleeve: row.sleeve,
        symbol: text(row.symbol),
        at,
        externalId: text(row.external_id),
      },
      EDGES,
    );
    if (pulse) pulses.push(pulse);
  }
  return pulses;
}

async function buildPulses(since: string | null): Promise<SystemPulse[]> {
  const rows = await sqlQuery<{
    id: string;
    status: string;
    pr_number: number | null;
    updated_at: Date | string;
  }>(
    `SELECT id, status, pr_number, updated_at
     FROM build_items
     WHERE ($1::timestamptz IS NULL OR updated_at > $1::timestamptz)
     ORDER BY updated_at DESC
     LIMIT 8`,
    [since],
  );
  const pulses: SystemPulse[] = [];
  for (const row of rows) {
    const at = iso(row.updated_at);
    if (!at) continue;
    const pulse = mapBuildPulse(
      { id: text(row.id), status: text(row.status), prNumber: intOrNull(row.pr_number), at },
      EDGES,
    );
    if (pulse) pulses.push(pulse);
  }
  return pulses;
}

async function calendarPulses(since: string | null): Promise<SystemPulse[]> {
  const rows = await sqlQuery<{
    id: string;
    kind: string | null;
    lane: string | null;
    title: string;
    status: string;
    updated_at: Date | string;
  }>(
    `SELECT id, kind, lane, title, status, updated_at
     FROM calendar_entries
     WHERE ($1::timestamptz IS NULL OR updated_at > $1::timestamptz)
     ORDER BY updated_at DESC
     LIMIT 12`,
    [since],
  );
  const pulses: SystemPulse[] = [];
  for (const row of rows) {
    const at = iso(row.updated_at);
    if (!at) continue;
    const pulse = mapCalendarPulse(
      {
        id: text(row.id),
        kind: row.kind == null ? null : text(row.kind),
        lane: row.lane == null ? null : text(row.lane),
        title: text(row.title),
        status: text(row.status),
        at,
      },
      EDGES,
    );
    if (pulse) pulses.push(pulse);
  }
  return pulses;
}

async function financePulses(since: string | null): Promise<SystemPulse[]> {
  const rows = await sqlQuery<{ as_of: Date | string; stored_at: Date | string }>(
    `SELECT as_of, stored_at
     FROM finance_snapshots
     WHERE ($1::timestamptz IS NULL OR stored_at > $1::timestamptz)
     ORDER BY stored_at DESC
     LIMIT 4`,
    [since],
  );
  const pulses: SystemPulse[] = [];
  for (const row of rows) {
    const at = iso(row.stored_at);
    if (!at) continue;
    const pulse = mapFinancePulse({ asOf: dayKey(row.as_of), at }, EDGES);
    if (pulse) pulses.push(pulse);
  }
  return pulses;
}

/** Recent real rows only. The returned pulses carry ids and a timestamp. */
export async function loadSystemEvents(since: string | null): Promise<SystemPulse[]> {
  const [fills, builds, calendar, finance] = await Promise.all([
    fillPulses(since),
    buildPulses(since),
    calendarPulses(since),
    financePulses(since),
  ]);
  return selectLiveEvents([...fills, ...builds, ...calendar, ...finance], since);
}
