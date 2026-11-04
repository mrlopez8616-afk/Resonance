import "server-only";

import {
  factorioFeedStale,
  factorioPlaying,
  numericText,
  type FactorioChartPoint,
  type FactorioCount,
  type FactorioHomeModel,
  type FactorioLatest,
  type FactorioPlayer,
  type FactorioRate,
  type FactorioSnapshot,
} from "@/lib/factorio";
import { sqlQuery } from "@/lib/pg/client";

type LatestRow = {
  tick: string;
  play_hours: string;
  rockets_launched: string;
  technologies_researched: string;
  current_research: string | null;
  research_progress: string | null;
  players: unknown;
  production: unknown;
  science_produced: unknown;
  machines: unknown;
  received_at: string | Date;
};

type HistoryRow = {
  tick: string;
  play_hours: string;
  rockets_launched: string;
};

export type FactorioPageData = {
  latest: FactorioLatest | null;
  history: FactorioChartPoint[];
};

const UPSERT_SQL = `INSERT INTO factorio_snapshots (
  tick, play_hours, rockets_launched, technologies_researched,
  current_research, research_progress, players, production, consumption,
  science_produced, machines, surfaces, game_time, reason, source, version,
  received_at, payload
) VALUES (
  $1, $2::numeric, $3, $4,
  $5, $6::numeric, $7::jsonb, $8::jsonb, $9::jsonb,
  $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16,
  now(), $17::jsonb
)
ON CONFLICT (tick) DO UPDATE SET
  play_hours = EXCLUDED.play_hours,
  rockets_launched = EXCLUDED.rockets_launched,
  technologies_researched = EXCLUDED.technologies_researched,
  current_research = EXCLUDED.current_research,
  research_progress = EXCLUDED.research_progress,
  players = EXCLUDED.players,
  production = EXCLUDED.production,
  consumption = EXCLUDED.consumption,
  science_produced = EXCLUDED.science_produced,
  machines = EXCLUDED.machines,
  surfaces = EXCLUDED.surfaces,
  game_time = EXCLUDED.game_time,
  reason = EXCLUDED.reason,
  source = EXCLUDED.source,
  version = EXCLUDED.version,
  received_at = now(),
  payload = EXCLUDED.payload`;

function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asTime(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

function asJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value;
}

function rates(value: unknown): FactorioRate[] {
  const parsed = asJson(value);
  if (!Array.isArray(parsed)) return [];
  const rows: FactorioRate[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const record = item as { name?: unknown; per_min?: unknown; perMin?: unknown };
    const name = typeof record.name === "string" ? record.name : "";
    const perMin = asNumber(record.per_min ?? record.perMin);
    if (!name || perMin === null) continue;
    rows.push({ name, perMin });
  }
  return rows;
}

function counts(value: unknown): FactorioCount[] {
  const parsed = asJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const rows: FactorioCount[] = [];
  for (const [name, raw] of Object.entries(parsed)) {
    const total = asNumber(raw);
    if (!name || total === null) continue;
    rows.push({ name, total });
  }
  return rows;
}

function players(value: unknown): FactorioPlayer[] {
  const parsed = asJson(value);
  if (!Array.isArray(parsed)) return [];
  const rows: FactorioPlayer[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const record = item as {
      name?: unknown;
      connected?: unknown;
      onlineHours?: unknown;
      online_hours?: unknown;
      afkMinutes?: unknown;
      afk_minutes?: unknown;
    };
    const online = asNumber(record.onlineHours ?? record.online_hours);
    const afk = asNumber(record.afkMinutes ?? record.afk_minutes);
    rows.push({
      name: typeof record.name === "string" ? record.name : "",
      connected: record.connected === true,
      onlineHours: online,
      afkMinutes: afk,
    });
  }
  return rows;
}

function mapLatest(row: LatestRow): FactorioLatest | null {
  const tick = asNumber(row.tick);
  const playHours = asNumber(row.play_hours);
  const rockets = asNumber(row.rockets_launched);
  const technologies = asNumber(row.technologies_researched);
  const receivedAt = asTime(row.received_at);
  const progress = asNumber(row.research_progress);
  if (tick === null || playHours === null || rockets === null || technologies === null || !receivedAt) return null;
  return {
    tick,
    playHours,
    rockets,
    technologies,
    currentResearch: row.current_research?.trim() || null,
    researchProgress: progress,
    players: players(row.players),
    production: rates(row.production),
    science: counts(row.science_produced),
    machines: counts(row.machines),
    receivedAt,
  };
}

export async function readFactorioTokenHash(): Promise<string | null> {
  const rows = await sqlQuery<{ token_hash: string }>(
    `SELECT token_hash FROM factorio_tokens WHERE id = 1`,
  );
  const hash = rows[0]?.token_hash?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}

export async function factorioTokenConfigured(): Promise<boolean> {
  return (await readFactorioTokenHash()) !== null;
}

/** Stores the digest only. The caller shows the plaintext once and does not log it. */
export async function saveFactorioTokenHash(tokenHash: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error("token hash must be 64 hex characters");
  await sqlQuery(
    `INSERT INTO factorio_tokens (id, token_hash, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET
       token_hash = EXCLUDED.token_hash,
       updated_at = now()`,
    [tokenHash],
  );
}

export async function writeFactorioSnapshot(snapshot: FactorioSnapshot, payload: unknown): Promise<void> {
  const science = Object.fromEntries(snapshot.science.map((row) => [row.name, row.total]));
  const machines = Object.fromEntries(snapshot.machines.map((row) => [row.name, row.total]));
  await sqlQuery(UPSERT_SQL, [
    snapshot.tick,
    numericText(snapshot.playHours),
    snapshot.rockets,
    snapshot.technologies,
    snapshot.currentResearch,
    snapshot.researchProgress === null ? null : numericText(snapshot.researchProgress),
    jsonText(snapshot.players.map((player) => ({
      name: player.name,
      connected: player.connected,
      online_hours: player.onlineHours,
      afk_minutes: player.afkMinutes,
    }))),
    jsonText(snapshot.production.map((row) => ({ name: row.name, per_min: row.perMin }))),
    jsonText(snapshot.consumption.map((row) => ({ name: row.name, per_min: row.perMin }))),
    jsonText(science),
    jsonText(machines),
    jsonText(snapshot.surfaces),
    snapshot.gameTime,
    snapshot.reason,
    snapshot.source,
    snapshot.version,
    jsonText(payload),
  ]);
}

export async function readFactorioPage(now = Date.now()): Promise<FactorioPageData & { stale: boolean }> {
  const [latestRows, historyRows] = await Promise.all([
    sqlQuery<LatestRow>(
      `SELECT tick::text AS tick, play_hours::text AS play_hours,
              rockets_launched::text AS rockets_launched,
              technologies_researched::text AS technologies_researched,
              current_research, research_progress::text AS research_progress,
              players, production, science_produced, machines, received_at
       FROM factorio_snapshots
       ORDER BY received_at DESC, tick DESC
       LIMIT 1`,
    ),
    sqlQuery<HistoryRow>(
      `SELECT tick::text AS tick, play_hours::text AS play_hours, rockets_launched::text AS rockets_launched
       FROM factorio_snapshots
       ORDER BY tick ASC`,
    ),
  ]);
  const latest = latestRows[0] ? mapLatest(latestRows[0]) : null;
  const history: FactorioChartPoint[] = [];
  for (const row of historyRows) {
    const tick = asNumber(row.tick);
    const playHours = asNumber(row.play_hours);
    const rockets = asNumber(row.rockets_launched);
    if (tick === null || playHours === null || rockets === null) continue;
    history.push({ tick, playHours, rockets });
  }
  return {
    latest,
    history,
    stale: latest
      ? factorioFeedStale({
          receivedAt: latest.receivedAt,
          playing: factorioPlaying(latest.players),
          now,
        })
      : false,
  };
}

export async function loadFactorioHome(now = Date.now()): Promise<FactorioHomeModel> {
  const page = await readFactorioPage(now);
  if (!page.latest) {
    return { unavailable: false, playHours: null, rockets: null, stale: false };
  }
  return {
    unavailable: false,
    playHours: page.latest.playHours,
    rockets: page.latest.rockets,
    stale: page.stale,
  };
}

export async function loadFactorioFreshness(now = Date.now()): Promise<{
  receivedAt: string | null;
  stale: boolean;
}> {
  const rows = await sqlQuery<{ received_at: string | Date; players: unknown }>(
    `SELECT received_at, players
     FROM factorio_snapshots
     ORDER BY received_at DESC, tick DESC
     LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return { receivedAt: null, stale: false };
  const receivedAt = asTime(row.received_at);
  if (!receivedAt) return { receivedAt: null, stale: false };
  return {
    receivedAt,
    stale: factorioFeedStale({
      receivedAt,
      playing: factorioPlaying(players(row.players)),
      now,
    }),
  };
}
