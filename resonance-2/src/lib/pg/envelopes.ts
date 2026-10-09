import type { CalendarEvent } from "@/data/calendar";
import type { Fill } from "@/data/fills";
import { betOrderKey, type Bet } from "@/lib/bets";
import {
  BETS_STORE_VERSION,
  parseBetsEnvelope,
  type BetsStoreEnvelope,
} from "@/lib/bets-store-core";
import {
  CALENDAR_STORE_VERSION,
  parseCalendarEnvelope,
  type CalendarStoreEnvelope,
} from "@/lib/calendar-store-core";
import { fillRowKey, overlayStoredFillFields } from "@/lib/fills";
import {
  FILLS_STORE_VERSION,
  parseFillsEnvelope,
  type FillsStoreEnvelope,
} from "@/lib/fills-store-core";
import { breakdownFromColumns, linksColumn, type FightBreakdown } from "@/lib/fight-breakdowns";
import {
  BREAKDOWNS_STORE_VERSION,
  createEmptyBreakdownsEnvelope,
  type FightBreakdownsEnvelope,
} from "@/lib/fight-breakdowns-store-core";
import { sqlQuery } from "@/lib/pg/client";
import type { SleevePrints } from "@/lib/sleeve-apply";

export type WriteCounts = {
  read: number;
  inserted: number;
  updated: number;
  unchanged: number;
};

export type SaveOptions = {
  dryRun?: boolean;
  /** Recorded on new settlement-history rows. */
  settlementSource?: string;
};

export type FightResultRecord = {
  event: string;
  fightSlug: string;
  winner: string;
  method: string;
  round: number;
  time: string;
  status: string;
  opponent?: string;
  source?: string;
};

function emptyCounts(read = 0): WriteCounts {
  return { read, inserted: 0, updated: 0, unchanged: 0 };
}

function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = sortKeys(record[key]);
    return sorted;
  }
  return value;
}

function readJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value ?? null;
}

function isoFrom(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  return null;
}

type MetaRow = {
  version: number | string;
  updated_at: unknown;
  seeded_at: unknown;
};

async function readMeta(domain: string): Promise<MetaRow | null> {
  const rows = await sqlQuery<MetaRow>(
    `SELECT version, updated_at, seeded_at FROM store_meta WHERE domain = $1`,
    [domain],
  );
  return rows[0] ?? null;
}

async function writeMeta(
  domain: string,
  version: number,
  updatedAt: string,
  seededAt: string | null,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  await sqlQuery(
    `INSERT INTO store_meta (domain, version, updated_at, seeded_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (domain) DO UPDATE
     SET version = EXCLUDED.version,
         updated_at = EXCLUDED.updated_at,
         seeded_at = EXCLUDED.seeded_at`,
    [domain, version, updatedAt, seededAt],
  );
}

function envelopeClock(meta: MetaRow | null, fallback: string): { updatedAt: string; seededAt: string | null } {
  return {
    updatedAt: isoFrom(meta?.updated_at) ?? fallback,
    seededAt: isoFrom(meta?.seeded_at),
  };
}

function correctionVersion(bet: Bet): number | null {
  const version = (bet as Bet & { correctionVersion?: unknown }).correctionVersion;
  if (typeof version === "number" && Number.isInteger(version) && version > 0) return version;
  return null;
}

function settlementKey(bet: Bet): string | null {
  if (bet.status === "open") return null;
  return `${bet.id}:${bet.status}:${bet.settledAt ?? ""}`;
}

export async function loadBetsEnvelope(): Promise<BetsStoreEnvelope | null> {
  const [meta, rows] = await Promise.all([
    readMeta("bets"),
    sqlQuery<{ payload: unknown }>(`SELECT payload FROM bets ORDER BY placed_at ASC, id ASC`),
  ]);
  if (!meta && rows.length === 0) return null;
  const clock = envelopeClock(meta, new Date().toISOString());
  return parseBetsEnvelope({
    version: BETS_STORE_VERSION,
    updatedAt: clock.updatedAt,
    seededAt: clock.seededAt,
    bets: rows.map((row) => readJson(row.payload)),
  });
}

export async function saveBetsEnvelope(
  envelope: BetsStoreEnvelope,
  options: SaveOptions = {},
): Promise<{ bets: WriteCounts; settlements: WriteCounts }> {
  const dryRun = options.dryRun === true;
  const source = options.settlementSource ?? "store";
  const existing = await sqlQuery<{ id: string; payload: unknown }>(
    `SELECT id, payload FROM bets`,
  );
  const byId = new Map(existing.map((row) => [row.id, readJson(row.payload)]));
  const bets = emptyCounts(envelope.bets.length);
  const pending: Bet[] = [];

  for (const bet of envelope.bets) {
    const current = byId.get(bet.id);
    if (!current) {
      bets.inserted += 1;
      pending.push(bet);
      continue;
    }
    if (canonical(current) === canonical(bet)) bets.unchanged += 1;
    else {
      bets.updated += 1;
      pending.push(bet);
    }
  }

  const settlementIds = new Set(
    (
      await sqlQuery<{ external_id: string }>(`SELECT external_id FROM settlements`)
    ).map((row) => row.external_id),
  );
  const settlements = emptyCounts(
    envelope.bets.filter((bet) => settlementKey(bet)).length,
  );
  const settlementRows = envelope.bets.flatMap((bet) => {
    const key = settlementKey(bet);
    if (!key) return [];
    if (settlementIds.has(key)) {
      settlements.unchanged += 1;
      return [];
    }
    settlements.inserted += 1;
    return [{ bet, key }];
  });

  if (!dryRun) {
    for (const bet of pending) {
      await sqlQuery(
        `INSERT INTO bets (
           id, order_id, event, fight, fight_slug, pick, stake, odds_pct, payout, status,
           settled_payout, realized_pnl, settled_at, venue, ticker, placed_at, tier, payload, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19
         )
         ON CONFLICT (id) DO UPDATE SET
           order_id = EXCLUDED.order_id,
           event = EXCLUDED.event,
           fight = EXCLUDED.fight,
           fight_slug = EXCLUDED.fight_slug,
           pick = EXCLUDED.pick,
           stake = EXCLUDED.stake,
           odds_pct = EXCLUDED.odds_pct,
           payout = EXCLUDED.payout,
           status = EXCLUDED.status,
           settled_payout = EXCLUDED.settled_payout,
           realized_pnl = EXCLUDED.realized_pnl,
           settled_at = EXCLUDED.settled_at,
           venue = EXCLUDED.venue,
           ticker = EXCLUDED.ticker,
           placed_at = EXCLUDED.placed_at,
           tier = EXCLUDED.tier,
           payload = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at`,
        [
          bet.id,
          betOrderKey(bet),
          bet.event,
          bet.fight,
          bet.fightSlug,
          bet.pick,
          bet.stake,
          bet.oddsPct,
          bet.payout,
          bet.status,
          bet.settledPayout ?? null,
          bet.realizedPnl ?? null,
          bet.settledAt ?? null,
          bet.venue,
          bet.ticker,
          bet.time,
          bet.tier ?? null,
          JSON.stringify(bet),
          envelope.updatedAt,
        ],
      );
      const version = correctionVersion(bet);
      if (version) {
        await sqlQuery(
          `INSERT INTO bet_corrections (bet_id, version, payload)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (bet_id, version) DO NOTHING`,
          [bet.id, version, JSON.stringify({ id: bet.id, version })],
        );
      }
    }
    for (const row of settlementRows) {
      await sqlQuery(
        `INSERT INTO settlements (
           bet_id, status, payout, realized_pnl, settled_at, source, external_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (external_id) DO NOTHING`,
        [
          row.bet.id,
          row.bet.status,
          row.bet.settledPayout ?? null,
          row.bet.realizedPnl ?? null,
          row.bet.settledAt ?? envelope.updatedAt,
          source,
          row.key,
        ],
      );
    }
    await writeMeta("bets", envelope.version, envelope.updatedAt, envelope.seededAt, false);
  }

  return { bets, settlements };
}

function isTradeFill(fill: Fill): fill is Fill & { side: "buy" | "sell"; quantity: string; price: string } {
  return fill.kind !== "bet" && typeof fill.side === "string";
}

type TrackedFill = {
  id: string | null;
  source: string;
  externalId: string;
  payload: unknown;
};

/** Trade identity across seed:, venue:, and bare keys. Bets stay on external_id. */
function fillOrderToken(payload: unknown, externalId: string): string | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (record.kind === "bet") return null;
    if (typeof record.orderId === "string" && record.orderId.trim()) {
      return record.orderId.trim().toLowerCase();
    }
  }
  const lower = externalId.trim().toLowerCase();
  const colon = lower.lastIndexOf(":");
  const token = (colon >= 0 ? lower.slice(colon + 1) : lower).trim();
  return token.length > 0 ? token : null;
}

function preferTracked(rows: readonly TrackedFill[], source: string): TrackedFill | undefined {
  return rows.find((row) => row.source === source) ?? rows[0];
}

export async function loadFillsEnvelope(): Promise<FillsStoreEnvelope | null> {
  const [meta, rows, prints] = await Promise.all([
    readMeta("fills"),
    sqlQuery<{ payload: unknown; sleeve: string | null; venue: string | null }>(
      `SELECT payload, sleeve, venue FROM fills ORDER BY id ASC`,
    ),
    sqlQuery<{ ticker: string; sleeve_id: string; quantity: string }>(
      `SELECT ticker, sleeve_id, quantity FROM sleeve_prints`,
    ),
  ]);
  if (!meta && rows.length === 0) return null;
  const clock = envelopeClock(meta, new Date().toISOString());
  const sleevePrints: SleevePrints = {};
  for (const row of prints) {
    const book = sleevePrints[row.ticker] ?? {};
    book[row.sleeve_id] = row.quantity;
    sleevePrints[row.ticker] = book;
  }
  return parseFillsEnvelope({
    version: FILLS_STORE_VERSION,
    updatedAt: clock.updatedAt,
    seededAt: clock.seededAt,
    fills: rows.map((row) =>
      overlayStoredFillFields(readJson(row.payload), {
        sleeve: row.sleeve,
        venue: row.venue,
      }),
    ),
    sleevePrints,
  });
}

export async function saveFillsEnvelope(
  envelope: FillsStoreEnvelope,
  options: SaveOptions = {},
): Promise<WriteCounts> {
  const dryRun = options.dryRun === true;
  const existing = await sqlQuery<{ id: string | number; source: string; external_id: string; payload: unknown }>(
    `SELECT id, source, external_id, payload FROM fills`,
  );
  // A fill's order can sit under seed:<id>, robinhood:<id>, or the bare id.
  // Match any of those and rewrite that row. A second key for the same order
  // must not insert another row.
  const byExternalId = new Map<string, TrackedFill[]>();
  const byOrder = new Map<string, TrackedFill[]>();
  const detach = (row: TrackedFill) => {
    const external = (byExternalId.get(row.externalId) ?? []).filter((item) => item !== row);
    if (external.length === 0) byExternalId.delete(row.externalId);
    else byExternalId.set(row.externalId, external);
    const token = fillOrderToken(row.payload, row.externalId);
    if (!token) return;
    const group = (byOrder.get(token) ?? []).filter((item) => item !== row);
    if (group.length === 0) byOrder.delete(token);
    else byOrder.set(token, group);
  };
  const attach = (row: TrackedFill) => {
    const external = byExternalId.get(row.externalId) ?? [];
    external.push(row);
    byExternalId.set(row.externalId, external);
    const token = fillOrderToken(row.payload, row.externalId);
    if (!token) return;
    const group = byOrder.get(token) ?? [];
    group.push(row);
    byOrder.set(token, group);
  };
  const identityTaken = (source: string, externalId: string, self: TrackedFill) =>
    (byExternalId.get(externalId) ?? []).some((row) => row !== self && row.source === source);
  for (const row of existing) {
    attach({
      id: String(row.id),
      source: row.source,
      externalId: row.external_id,
      payload: readJson(row.payload),
    });
  }
  const counts = emptyCounts(envelope.fills.length);
  const pending: { fill: Fill; source: string; externalId: string; id: string | null; tracked: TrackedFill }[] = [];

  for (const fill of envelope.fills) {
    const source = fill.venue ?? "seed";
    const externalId = fillRowKey(fill).trim().toLowerCase();
    const token = fill.kind === "bet" ? null : fill.orderId.trim().toLowerCase();
    const exact = byExternalId.get(externalId) ?? [];
    const current = preferTracked(exact, source) ?? (token ? preferTracked(byOrder.get(token) ?? [], source) : undefined);
    if (!current) {
      const tracked: TrackedFill = { id: null, source, externalId, payload: fill };
      attach(tracked);
      counts.inserted += 1;
      pending.push({ fill, source, externalId, id: null, tracked });
      continue;
    }
    let nextSource = source;
    let nextExternalId = externalId;
    if (identityTaken(nextSource, nextExternalId, current)) {
      nextSource = current.source;
      nextExternalId = current.externalId;
    }
    const samePayload = canonical(current.payload) === canonical(fill);
    if (samePayload && current.source === nextSource && current.externalId === nextExternalId) {
      counts.unchanged += 1;
      continue;
    }
    detach(current);
    current.source = nextSource;
    current.externalId = nextExternalId;
    current.payload = fill;
    attach(current);
    const queued = pending.find((row) => row.tracked === current);
    if (queued) {
      queued.fill = fill;
      queued.source = nextSource;
      queued.externalId = nextExternalId;
      continue;
    }
    counts.updated += 1;
    pending.push({ fill, source: nextSource, externalId: nextExternalId, id: current.id, tracked: current });
  }

  if (dryRun) return counts;

  for (const row of pending) {
    const trade = isTradeFill(row.fill);
    const values = [
      row.source,
      row.externalId,
      row.fill.time,
      row.fill.symbol,
      trade ? row.fill.side : null,
      trade ? row.fill.quantity : null,
      trade ? row.fill.price : null,
      row.fill.venue ?? null,
      trade ? (row.fill.sleeve ?? null) : null,
      row.fill.result,
      row.fill.logOnly === true,
      row.fill.note ?? null,
      JSON.stringify(row.fill),
    ];
    if (row.id === null) {
      await sqlQuery(
        `INSERT INTO fills (
           source, external_id, filled_at, symbol, side, quantity, price, venue, sleeve,
           result, log_only, note, payload
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
         )
         ON CONFLICT (source, external_id) DO UPDATE SET
           filled_at = EXCLUDED.filled_at,
           symbol = EXCLUDED.symbol,
           side = EXCLUDED.side,
           quantity = EXCLUDED.quantity,
           price = EXCLUDED.price,
           venue = EXCLUDED.venue,
           sleeve = EXCLUDED.sleeve,
           result = EXCLUDED.result,
           log_only = EXCLUDED.log_only,
           note = EXCLUDED.note,
           payload = EXCLUDED.payload`,
        values,
      );
      continue;
    }
    await sqlQuery(
      `UPDATE fills SET
         source = $1,
         external_id = $2,
         filled_at = $3,
         symbol = $4,
         side = $5,
         quantity = $6,
         price = $7,
         venue = $8,
         sleeve = $9,
         result = $10,
         log_only = $11,
         note = $12,
         payload = $13::jsonb
       WHERE id = $14`,
      [...values, row.id],
    );
  }

  await sqlQuery(`DELETE FROM sleeve_prints`);
  for (const [ticker, book] of Object.entries(envelope.sleevePrints)) {
    for (const [sleeveId, quantity] of Object.entries(book)) {
      await sqlQuery(
        `INSERT INTO sleeve_prints (ticker, sleeve_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (ticker, sleeve_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
        [ticker, sleeveId, quantity],
      );
    }
  }
  await writeMeta("fills", envelope.version, envelope.updatedAt, envelope.seededAt, false);
  return counts;
}

export async function loadCalendarEnvelope(): Promise<CalendarStoreEnvelope | null> {
  const [meta, rows] = await Promise.all([
    readMeta("calendar"),
    sqlQuery<{ payload: unknown }>(
      `SELECT payload FROM calendar_entries ORDER BY start_at ASC, id ASC`,
    ),
  ]);
  if (!meta && rows.length === 0) return null;
  const clock = envelopeClock(meta, new Date().toISOString());
  return parseCalendarEnvelope({
    version: CALENDAR_STORE_VERSION,
    updatedAt: clock.updatedAt,
    seededAt: clock.seededAt,
    events: rows.map((row) => readJson(row.payload)),
  });
}

export async function saveCalendarEnvelope(
  envelope: CalendarStoreEnvelope,
  options: SaveOptions = {},
): Promise<WriteCounts> {
  const dryRun = options.dryRun === true;
  const existing = await sqlQuery<{ id: string; payload: unknown }>(
    `SELECT id, payload FROM calendar_entries`,
  );
  const byId = new Map(existing.map((row) => [row.id, readJson(row.payload)]));
  const counts = emptyCounts(envelope.events.length);
  const pending: CalendarEvent[] = [];

  for (const event of envelope.events) {
    const current = byId.get(event.id);
    if (!current) {
      counts.inserted += 1;
      pending.push(event);
      continue;
    }
    if (canonical(current) === canonical(event)) counts.unchanged += 1;
    else {
      counts.updated += 1;
      pending.push(event);
    }
  }

  if (dryRun) return counts;

  for (const event of pending) {
    await sqlQuery(
      `INSERT INTO calendar_entries (
         id, kind, lane, node, start_at, title, status, writer, event_slug, payload, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       ON CONFLICT (id) DO UPDATE SET
         kind = EXCLUDED.kind,
         lane = EXCLUDED.lane,
         node = EXCLUDED.node,
         start_at = EXCLUDED.start_at,
         title = EXCLUDED.title,
         status = EXCLUDED.status,
         writer = EXCLUDED.writer,
         event_slug = EXCLUDED.event_slug,
         payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at`,
      [
        event.id,
        event.kind ?? null,
        event.lane ?? null,
        event.node ?? null,
        event.start,
        event.title,
        event.status,
        event.writer,
        event.eventSlug ?? null,
        JSON.stringify(event),
        envelope.updatedAt,
      ],
    );
  }
  await writeMeta("calendar", envelope.version, envelope.updatedAt, envelope.seededAt, false);
  return counts;
}

export async function loadFightResults(): Promise<FightResultRecord[]> {
  const rows = await sqlQuery<{ payload: unknown }>(
    `SELECT payload FROM fight_results ORDER BY fight_slug ASC`,
  );
  return rows.flatMap((row) => {
    const payload = readJson(row.payload);
    if (!payload || typeof payload !== "object") return [];
    const record = payload as FightResultRecord;
    if (typeof record.fightSlug !== "string" || typeof record.winner !== "string") return [];
    return [record];
  });
}

export async function saveFightResults(
  rows: readonly FightResultRecord[],
  options: SaveOptions = {},
): Promise<WriteCounts> {
  const dryRun = options.dryRun === true;
  const existing = await sqlQuery<{ fight_slug: string; payload: unknown }>(
    `SELECT fight_slug, payload FROM fight_results`,
  );
  const bySlug = new Map(existing.map((row) => [row.fight_slug, readJson(row.payload)]));
  const counts = emptyCounts(rows.length);
  const pending: FightResultRecord[] = [];
  for (const row of rows) {
    const current = bySlug.get(row.fightSlug);
    if (!current) {
      counts.inserted += 1;
      pending.push(row);
      continue;
    }
    if (canonical(current) === canonical(row)) counts.unchanged += 1;
    else {
      counts.updated += 1;
      pending.push(row);
    }
  }
  if (dryRun) return counts;
  for (const row of pending) {
    await sqlQuery(
      `INSERT INTO fight_results (
         fight_slug, event, winner, method, round, clock, status, opponent, source, payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT (fight_slug) DO UPDATE SET
         event = EXCLUDED.event,
         winner = EXCLUDED.winner,
         method = EXCLUDED.method,
         round = EXCLUDED.round,
         clock = EXCLUDED.clock,
         status = EXCLUDED.status,
         opponent = EXCLUDED.opponent,
         source = EXCLUDED.source,
         payload = EXCLUDED.payload,
         updated_at = now()`,
      [
        row.fightSlug,
        row.event,
        row.winner,
        row.method,
        row.round,
        row.time,
        row.status,
        row.opponent ?? null,
        row.source ?? null,
        JSON.stringify(row),
      ],
    );
  }
  return counts;
}

function breakdownInstant(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function jsonOrNull(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

type BreakdownSqlRow = {
  event_slug: string;
  fight_slug: string;
  fight_n: unknown;
  card: unknown;
  slot: unknown;
  division: unknown;
  rounds: unknown;
  a_name: unknown;
  b_name: unknown;
  lean: unknown;
  conf: unknown;
  tier: unknown;
  method: unknown;
  why: unknown;
  x_factor: unknown;
  edges: unknown;
  odds: unknown;
  stats: unknown;
  links: unknown;
  updated_at: unknown;
};

export async function loadFightBreakdowns(): Promise<FightBreakdownsEnvelope> {
  const rows = await sqlQuery<BreakdownSqlRow>(
    `SELECT event_slug, fight_slug, fight_n, card, slot, division, rounds,
            a_name, b_name, lean, conf, tier, method, why, x_factor,
            edges, odds, stats, links, updated_at
       FROM fight_breakdowns
      ORDER BY event_slug ASC, fight_slug ASC`,
  );
  const breakdowns: FightBreakdown[] = [];
  let updatedAt = "";
  for (const row of rows) {
    const breakdown = breakdownFromColumns(row);
    if (breakdown) breakdowns.push(breakdown);
    const instant = breakdownInstant(row.updated_at);
    if (instant && instant > updatedAt) updatedAt = instant;
  }
  if (breakdowns.length === 0) return createEmptyBreakdownsEnvelope();
  return {
    version: BREAKDOWNS_STORE_VERSION,
    updatedAt: updatedAt || createEmptyBreakdownsEnvelope().updatedAt,
    breakdowns,
  };
}

export async function saveFightBreakdowns(envelope: FightBreakdownsEnvelope): Promise<void> {
  for (const row of envelope.breakdowns) {
    await sqlQuery(
      `INSERT INTO fight_breakdowns (
         event_slug, fight_slug, fight_n, card, slot, division, rounds,
         a_name, b_name, lean, conf, tier, method, why, x_factor,
         edges, odds, stats, links, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13, $14, $15,
         $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20
       )
       ON CONFLICT (event_slug, fight_slug) DO UPDATE SET
         fight_n = EXCLUDED.fight_n,
         card = EXCLUDED.card,
         slot = EXCLUDED.slot,
         division = EXCLUDED.division,
         rounds = EXCLUDED.rounds,
         a_name = EXCLUDED.a_name,
         b_name = EXCLUDED.b_name,
         lean = EXCLUDED.lean,
         conf = EXCLUDED.conf,
         tier = EXCLUDED.tier,
         method = EXCLUDED.method,
         why = EXCLUDED.why,
         x_factor = EXCLUDED.x_factor,
         edges = EXCLUDED.edges,
         odds = EXCLUDED.odds,
         stats = EXCLUDED.stats,
         links = EXCLUDED.links,
         updated_at = EXCLUDED.updated_at`,
      [
        row.eventSlug,
        row.fightSlug,
        row.fightN,
        row.card,
        row.slot,
        row.division,
        row.rounds,
        row.aName,
        row.bName,
        row.lean,
        row.conf,
        row.tier,
        row.method,
        row.why,
        row.xFactor,
        JSON.stringify(row.edges),
        jsonOrNull(row.odds),
        jsonOrNull(row.stats),
        jsonOrNull(linksColumn(row)),
        envelope.updatedAt,
      ],
    );
  }
}
