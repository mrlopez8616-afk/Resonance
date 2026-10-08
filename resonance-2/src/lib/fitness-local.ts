import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MANUAL_RUN_IDS, MANUAL_STEP_ID, manualFitnessSeed } from "@/lib/fitness-seed";
import type { FitnessWrites } from "@/lib/fitness-types";

/**
 * Dev-only file store so a local ingest can be screenshotted without Neon.
 * Production, `next start`, and Vercel ignore FITNESS_LOCAL_FILE.
 */
export function fitnessLocalFile(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.VERCEL) return null;
  const file = process.env.FITNESS_LOCAL_FILE?.trim() ?? "";
  if (!file.startsWith("/tmp/")) return null;
  if (file.includes("..")) return null;
  return file;
}

function empty(): FitnessWrites {
  return { metrics: [], workouts: [] };
}

function readSnapshot(file: string): FitnessWrites {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as FitnessWrites;
    return {
      metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
      workouts: Array.isArray(parsed.workouts) ? parsed.workouts : [],
    };
  } catch {
    return empty();
  }
}

function writeSnapshot(file: string, rows: FitnessWrites): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(rows));
  renameSync(temp, file);
}

function merge(current: FitnessWrites, rows: FitnessWrites): FitnessWrites {
  const metrics = new Map(current.metrics.map((row) => [`${row.source}:${row.externalId}`, row]));
  for (const row of rows.metrics) metrics.set(`${row.source}:${row.externalId}`, row);
  const workouts = new Map(current.workouts.map((row) => [`${row.source}:${row.externalId}`, row]));
  for (const row of rows.workouts) workouts.set(`${row.source}:${row.externalId}`, row);
  return { metrics: [...metrics.values()], workouts: [...workouts.values()] };
}

function withSeed(rows: FitnessWrites): FitnessWrites {
  const seed = manualFitnessSeed();
  const hasSteps = rows.metrics.some(
    (row) => row.source === "manual" && row.externalId === MANUAL_STEP_ID,
  );
  const hasRuns = MANUAL_RUN_IDS.every((id) =>
    rows.workouts.some((row) => row.source === "manual" && row.externalId === id),
  );
  return merge(rows, {
    metrics: hasSteps ? [] : seed.metrics,
    workouts: hasRuns ? [] : seed.workouts,
  });
}

export function readLocalFitness(): FitnessWrites {
  const file = fitnessLocalFile();
  if (!file) return empty();
  const seeded = withSeed(readSnapshot(file));
  writeSnapshot(file, seeded);
  return seeded;
}

export function upsertLocalFitness(rows: FitnessWrites): { metrics: number; workouts: number } {
  const file = fitnessLocalFile();
  if (!file) return { metrics: 0, workouts: 0 };
  writeSnapshot(file, merge(readLocalFitness(), rows));
  return { metrics: rows.metrics.length, workouts: rows.workouts.length };
}
