import "server-only";

import {
  FighterCareerError,
  sameCareerFight,
  type CareerFight,
  type FighterCareerWrite,
  type FighterProfile,
  type FighterResult,
} from "@/lib/fighter-careers";
import { postgresFailureReason, sqlQuery } from "@/lib/pg/client";
import { FIGHTER_CAREERS_SQL } from "@/lib/pg/embedded-migrations";
import { splitSqlStatements } from "@/lib/pg/migrate";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

export type FighterCareerRead = {
  fighter: FighterProfile;
  fights: CareerFight[];
};

type FighterRow = {
  slug: string;
  name: string;
  metadata: unknown;
};

type FightRow = {
  date: unknown;
  event: string | null;
  opponent: string;
  result: string | null;
  method: string | null;
  round: number | null;
  time: string | null;
  sig_strikes_landed: number | null;
  sig_strikes_attempted: number | null;
  total_strikes_landed: number | null;
  total_strikes_attempted: number | null;
  takedowns_landed: number | null;
  takedowns_attempted: number | null;
  sub_attempts: number | null;
  control_time_seconds: number | null;
  knockdowns: number | null;
};

const FIGHTER_SQL = `SELECT slug, name, metadata FROM fighters WHERE slug = $1`;
const FIGHTS_SQL = `SELECT "date", event, opponent, result, method, round, "time",
       sig_strikes_landed, sig_strikes_attempted, total_strikes_landed, total_strikes_attempted,
       takedowns_landed, takedowns_attempted, sub_attempts, control_time_seconds, knockdowns
     FROM fighter_fights
     WHERE fighter_slug = $1
     ORDER BY "date" DESC, opponent ASC`;

const INSERT_FIGHTER = `INSERT INTO fighters (slug, name, metadata)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       metadata = COALESCE(EXCLUDED.metadata, fighters.metadata),
       updated_at = now()`;

const UPDATE_FIGHTER = `UPDATE fighters
     SET name = $2, metadata = $3::jsonb, updated_at = now()
     WHERE slug = $1`;

const UPDATE_NAME = `UPDATE fighters SET name = $2, updated_at = now() WHERE slug = $1`;

const INSERT_FIGHT = `INSERT INTO fighter_fights (
       fighter_slug, "date", event, opponent, result, method, round, "time",
       sig_strikes_landed, sig_strikes_attempted, total_strikes_landed, total_strikes_attempted,
       takedowns_landed, takedowns_attempted, sub_attempts, control_time_seconds, knockdowns
     ) VALUES (
       $1, $2::date, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14, $15, $16, $17
     )
     ON CONFLICT (fighter_slug, "date", opponent) DO UPDATE SET
       event = EXCLUDED.event,
       result = EXCLUDED.result,
       method = EXCLUDED.method,
       round = EXCLUDED.round,
       "time" = EXCLUDED."time",
       sig_strikes_landed = EXCLUDED.sig_strikes_landed,
       sig_strikes_attempted = EXCLUDED.sig_strikes_attempted,
       total_strikes_landed = EXCLUDED.total_strikes_landed,
       total_strikes_attempted = EXCLUDED.total_strikes_attempted,
       takedowns_landed = EXCLUDED.takedowns_landed,
       takedowns_attempted = EXCLUDED.takedowns_attempted,
       sub_attempts = EXCLUDED.sub_attempts,
       control_time_seconds = EXCLUDED.control_time_seconds,
       knockdowns = EXCLUDED.knockdowns,
       updated_at = now()`;

function failureText(error: unknown): string {
  if (isStorageUnavailable(error)) return error.reason;
  return postgresFailureReason(error);
}

function missingTable(error: unknown): boolean {
  const reason = failureText(error);
  return /fighters|fighter_fights/i.test(reason) && /does not exist|no such/i.test(reason);
}

function dayText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function whole(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function resultOf(value: string | null): FighterResult | null {
  if (value === "win" || value === "loss" || value === "draw" || value === "nc") return value;
  return null;
}

function metadataOf(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function mapFight(row: FightRow): CareerFight {
  return {
    date: dayText(row.date),
    event: row.event?.trim() ? row.event.trim() : null,
    opponent: row.opponent,
    result: resultOf(row.result),
    method: row.method?.trim() ? row.method.trim() : null,
    round: whole(row.round),
    time: row.time?.trim() ? row.time.trim() : null,
    sigStrikesLanded: whole(row.sig_strikes_landed),
    sigStrikesAttempted: whole(row.sig_strikes_attempted),
    totalStrikesLanded: whole(row.total_strikes_landed),
    totalStrikesAttempted: whole(row.total_strikes_attempted),
    takedownsLanded: whole(row.takedowns_landed),
    takedownsAttempted: whole(row.takedowns_attempted),
    subAttempts: whole(row.sub_attempts),
    controlTimeSeconds: whole(row.control_time_seconds),
    knockdowns: whole(row.knockdowns),
  };
}

async function ensureCareerTables(): Promise<void> {
  try {
    await sqlQuery(`SELECT 1 AS ok FROM fighters LIMIT 1`);
    await sqlQuery(`SELECT 1 AS ok FROM fighter_fights LIMIT 1`);
  } catch (error) {
    if (!missingTable(error)) throw error;
    for (const statement of splitSqlStatements(FIGHTER_CAREERS_SQL)) {
      await sqlQuery(statement);
    }
  }
}

function metaJson(metadata: Record<string, unknown> | null): string | null {
  return metadata ? JSON.stringify(metadata) : null;
}

function sameMeta(left: Record<string, unknown> | null, right: Record<string, unknown> | null): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/** The stored fighter and fights. Missing slug returns null. */
export async function readFighterCareer(slug: string): Promise<FighterCareerRead | null> {
  await ensureCareerTables();
  const rows = await sqlQuery<FighterRow>(FIGHTER_SQL, [slug]);
  const fighter = rows[0];
  if (!fighter) return null;
  const fights = await sqlQuery<FightRow>(FIGHTS_SQL, [slug]);
  return {
    fighter: { slug: fighter.slug, name: fighter.name, metadata: metadataOf(fighter.metadata) },
    fights: fights.map(mapFight),
  };
}

/**
 * Upsert the fighter and each fight. A repeat of the same body does not write again.
 * A later post with new stats replaces that fight and does not add a second row.
 */
export async function upsertFighterCareer(
  input: FighterCareerWrite,
): Promise<{ fighter: FighterProfile; fights: CareerFight[]; deduped: boolean }> {
  await ensureCareerTables();
  const existing = await readFighterCareer(input.slug);
  let deduped = true;
  if (!existing) {
    deduped = false;
    await sqlQuery(INSERT_FIGHTER, [input.slug, input.name, metaJson(input.metadata)]);
  } else if (input.metadataProvided) {
    if (existing.fighter.name !== input.name || !sameMeta(existing.fighter.metadata, input.metadata)) {
      deduped = false;
      await sqlQuery(UPDATE_FIGHTER, [input.slug, input.name, metaJson(input.metadata)]);
    }
  } else if (existing.fighter.name !== input.name) {
    deduped = false;
    await sqlQuery(UPDATE_NAME, [input.slug, input.name]);
  }

  for (const fight of input.fights) {
    const stored = existing?.fights.find((row) => row.date === fight.date && row.opponent === fight.opponent);
    if (stored && sameCareerFight(stored, fight)) continue;
    deduped = false;
    await sqlQuery(INSERT_FIGHT, [
      input.slug,
      fight.date,
      fight.event,
      fight.opponent,
      fight.result,
      fight.method,
      fight.round,
      fight.time,
      fight.sigStrikesLanded,
      fight.sigStrikesAttempted,
      fight.totalStrikesLanded,
      fight.totalStrikesAttempted,
      fight.takedownsLanded,
      fight.takedownsAttempted,
      fight.subAttempts,
      fight.controlTimeSeconds,
      fight.knockdowns,
    ]);
  }

  const loaded = await readFighterCareer(input.slug);
  if (!loaded) throw new FighterCareerError("Fighter could not be stored.", 500);
  return { ...loaded, deduped };
}
