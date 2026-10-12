/**
 * Fight Desk KO-gate doctrine.
 * Founder, 2026-10-11, in force for UFC Edmonton (2026-10-17) onward.
 *
 * Money sits on the plan's STRONG picks (PLAY). Every other pick is free.
 * An opponent who wins 60% or more by KO/TKO drops the pick one tier and
 * blocks STRONG, unless the pick is rated 75%+ and has never been KO'd.
 * An opponent's losing streak is neutral: it does not move the tier.
 */

export const KO_GATE_MIN_PCT = 60;
export const KO_GATE_EXCEPTION_PICK_PCT = 75;

export const KO_PCT_LABEL = "KO%";
export const R1_FINISH_LABEL = "R1 finishes";

const WIN_SPLIT_LABELS = ["Wins (KO/Sub/Dec)", "Wins KO / Sub / Dec"] as const;
const LOSS_SPLIT_LABELS = ["Losses (KO/Sub/Dec)", "Losses KO / Sub / Dec"] as const;

export type PlanTier = "STRONG" | "LEAN" | "PASS";
export type StoredTier = "STRONG" | "LEAN";
export type StakePlan = "PLAY" | "free";

export type KoGateInput = {
  /** Posted plan tier. Null when the breakdown named no tier. */
  tier: PlanTier | null;
  /** Plan rating of our pick, in percent points. Null when the payload omitted it. */
  pickPct: number | null;
  /** Opponent wins by KO/TKO over wins. Null when the counts are missing. */
  opponentKoPct: number | null;
  /** True only when the payload says our fighter has zero KO/TKO losses. */
  pickNeverKod: boolean | null;
  /** Opponent streak text, such as "4L". A losing streak must not move the tier. */
  opponentStreak?: string | null;
};

export type KoGateResult = {
  tier: PlanTier | null;
  /** STRONG and LEAN are stored. PASS stays null, matching the breakdown column. */
  storedTier: StoredTier | null;
  gated: boolean;
  reason: string | null;
  /** STRONG is the only plan tier that takes money. */
  stakePlan: StakePlan | null;
};

export type MethodSplit = {
  ko: number;
  sub: number;
  dec: number;
};

function storedOf(tier: PlanTier | null): StoredTier | null {
  return tier === "STRONG" || tier === "LEAN" ? tier : null;
}

function stakeOf(tier: PlanTier | null): StakePlan | null {
  if (tier === "STRONG") return "PLAY";
  if (tier === "LEAN" || tier === "PASS") return "free";
  return null;
}

function resultOf(tier: PlanTier | null, gated: boolean, reason: string | null): KoGateResult {
  const safe = gated && tier === "STRONG" ? "LEAN" : tier;
  return {
    tier: safe,
    storedTier: storedOf(safe),
    gated,
    reason,
    stakePlan: stakeOf(safe),
  };
}

/** "4L", "L4", and the words "losing streak" are a losing streak. */
export function isLosingStreak(streak: string | null | undefined): boolean {
  if (streak == null) return false;
  const text = streak.trim();
  if (!text) return false;
  if (/^\d+\s*L$/i.test(text) || /^L\s*\d+$/i.test(text)) return true;
  return /\blosing streak\b/i.test(text);
}

/**
 * Tier steps contributed by the opponent's streak.
 * A losing streak is 0. This brick does not score any other streak either,
 * so form cannot raise or lower a tier.
 */
export function opponentStreakSignal(streak: string | null | undefined): number {
  if (isLosingStreak(streak)) return 0;
  return 0;
}

/** The posted tier, with a losing streak left neutral. */
export function tierAfterStreak(tier: PlanTier | null, streak: string | null | undefined): PlanTier | null {
  const steps = isLosingStreak(streak) ? 0 : opponentStreakSignal(streak);
  if (steps === 0) return tier;
  return tier;
}

export function parseCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text === "—" || text === "-" || text.toLowerCase() === "n/a") return null;
  if (text.toLowerCase().startsWith("not found")) return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Percent points. "60%" and 60 are 60. A missing or blank value is null. */
export function parsePercent(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text === "—" || text.toLowerCase() === "n/a") return null;
  const match = /^(\d+(\.\d+)?)\s*%$/.exec(text);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatKoPercent(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}%`;
}

/** Wins by KO/TKO over wins. Null when the win total is missing or zero. */
export function koWinPercent(winsByKo: number, wins: number): number | null {
  if (!Number.isFinite(winsByKo) || !Number.isFinite(wins)) return null;
  if (wins <= 0 || winsByKo < 0 || winsByKo > wins) return null;
  return (winsByKo * 100) / wins;
}

export function methodSplit(value: unknown): MethodSplit | null {
  if (typeof value !== "string") return null;
  const parts = value.split("/").map((part) => part.trim());
  if (parts.length < 3) return null;
  const ko = parseCount(parts[0]);
  const sub = parseCount(parts[1]);
  const dec = parseCount(parts[2]);
  if (ko == null || sub == null || dec == null) return null;
  return { ko, sub, dec };
}

function winsFromRecord(record: unknown): number | null {
  if (typeof record !== "string") return null;
  const match = /^(\d+)\s*-\s*\d+/.exec(record.trim());
  if (!match?.[1]) return null;
  const wins = Number(match[1]);
  return Number.isFinite(wins) ? wins : null;
}

export function resolveKoPercent(input: {
  winsKo?: unknown;
  winsSub?: unknown;
  winsDec?: unknown;
  record?: unknown;
  koPct?: unknown;
}): number | null {
  const ko = parseCount(input.winsKo);
  const sub = parseCount(input.winsSub);
  const dec = parseCount(input.winsDec);
  if (ko != null && sub != null && dec != null) return koWinPercent(ko, ko + sub + dec);
  if (ko != null) {
    const recordWins = winsFromRecord(input.record);
    if (recordWins != null) return koWinPercent(ko, recordWins);
  }
  if (input.koPct != null) return parsePercent(input.koPct);
  return null;
}

export function koPercentFromStats(stats: Record<string, string> | null | undefined): number | null {
  if (!stats) return null;
  for (const label of WIN_SPLIT_LABELS) {
    const split = methodSplit(stats[label]);
    if (!split) continue;
    return koWinPercent(split.ko, split.ko + split.sub + split.dec);
  }
  const posted = stats[KO_PCT_LABEL];
  return posted ? parsePercent(posted) : null;
}

export function neverBeenKod(
  stats: Record<string, string> | null | undefined,
  lossKo?: unknown,
): boolean | null {
  if (stats) {
    for (const label of LOSS_SPLIT_LABELS) {
      const split = methodSplit(stats[label]);
      if (split) return split.ko === 0;
    }
  }
  const raw = parseCount(lossKo);
  if (raw == null) return null;
  return raw === 0;
}

function presentText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text === "—" || text.toLowerCase() === "n/a") return null;
  if (text.toLowerCase().startsWith("not found")) return null;
  return text;
}

function isR1FinishWin(line: string): boolean {
  const text = line.toLowerCase();
  if (!/\bwin\b/.test(text)) return false;
  if (!/\br1\b|\bround\s*1\b/.test(text)) return false;
  if (/\bdecision\b/.test(text)) return false;
  return /\b(ko|tko|submission)\b/.test(text);
}

/**
 * R1 finish stat from an explicit field, or from recent fight lines.
 * Recent lines count wins finished in round 1. A missing source is null.
 */
export function r1FinishValue(input: {
  history?: readonly string[] | null;
  finishes?: unknown;
  rate?: unknown;
}): string | null {
  const finishes = presentText(input.finishes);
  if (finishes) return finishes;
  const rate = presentText(input.rate);
  if (rate) return rate.includes("%") ? rate : `${rate}%`;
  if (!input.history || input.history.length === 0) return null;
  const wins = input.history.filter(isR1FinishWin).length;
  return `${wins} of ${input.history.length}`;
}

export function historyLines(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const lines = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return lines.length ? lines : null;
}

/** Rows to add when the payload can support them. Missing numbers are omitted. */
export function finishStatRows(input: {
  winsKo?: unknown;
  winsSub?: unknown;
  winsDec?: unknown;
  record?: unknown;
  koPct?: unknown;
  history?: readonly string[] | null;
  r1Finishes?: unknown;
  r1Rate?: unknown;
}): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const pct = resolveKoPercent(input);
  if (pct != null) rows.push({ label: KO_PCT_LABEL, value: formatKoPercent(pct) });
  const r1 = r1FinishValue({ history: input.history, finishes: input.r1Finishes, rate: input.r1Rate });
  if (r1) rows.push({ label: R1_FINISH_LABEL, value: r1 });
  return rows;
}

/** Both fighters share these rows so a side-by-side table stays aligned. */
export function alignedFinishStats(input: Parameters<typeof finishStatRows>[0]): { label: string; value: string }[] {
  const rows = finishStatRows(input);
  const ko = rows.find((row) => row.label === KO_PCT_LABEL)?.value ?? "n/a";
  const r1 = rows.find((row) => row.label === R1_FINISH_LABEL)?.value ?? "n/a";
  return [
    { label: KO_PCT_LABEL, value: ko },
    { label: R1_FINISH_LABEL, value: r1 },
  ];
}

export function enrichFinishStats(
  stats: Record<string, string> | null | undefined,
  history?: readonly string[] | null,
  raw?: Record<string, unknown> | null,
): Record<string, string> {
  const next: Record<string, string> = { ...(stats ?? {}) };
  if (!next[KO_PCT_LABEL]) {
    const pct =
      koPercentFromStats(next) ??
      resolveKoPercent({
        winsKo: raw?.wins_ko,
        winsSub: raw?.wins_sub,
        winsDec: raw?.wins_dec,
        record: raw?.record,
        koPct: raw?.ko_pct ?? raw?.koPct,
      });
    if (pct != null) next[KO_PCT_LABEL] = formatKoPercent(pct);
  }
  if (!next[R1_FINISH_LABEL]) {
    const r1 = r1FinishValue({
      history: history ?? historyLines(raw?.last5) ?? historyLines(raw?.last3),
      finishes: raw?.r1_finishes ?? raw?.r1Finishes ?? raw?.finishes_r1 ?? raw?.r1_finish,
      rate: raw?.r1_finish_rate ?? raw?.r1FinishRate,
    });
    if (r1) next[R1_FINISH_LABEL] = r1;
  }
  return next;
}

function dropTier(tier: PlanTier | null): PlanTier | null {
  if (tier === "STRONG") return "LEAN";
  if (tier === "LEAN") return "PASS";
  return tier;
}

/**
 * Apply the KO gate to a posted tier.
 * Missing opponent KO% leaves the tier alone. The 75% exception needs both
 * the rating and a known zero KO losses. A losing streak adds no steps.
 */
export function applyKoGate(input: KoGateInput): KoGateResult {
  const base = tierAfterStreak(input.tier, input.opponentStreak);
  const ko = input.opponentKoPct;
  if (ko == null || !Number.isFinite(ko) || ko < KO_GATE_MIN_PCT) {
    return resultOf(base, false, null);
  }
  const exempt =
    input.pickPct != null &&
    Number.isFinite(input.pickPct) &&
    input.pickPct >= KO_GATE_EXCEPTION_PICK_PCT &&
    input.pickNeverKod === true;
  if (exempt) return resultOf(base, false, null);
  const dropped = dropTier(base);
  const changed = dropped !== base;
  const reason = changed ? `KO gate: opponent KO% ${formatKoPercent(ko)}` : null;
  return resultOf(dropped, changed, reason);
}

/** Shown confidence after a gate drop, so a blocked pick does not still read Strong. */
export function confAfterGate(
  conf: string | null,
  before: PlanTier | null,
  after: PlanTier | null,
): string | null {
  if (!conf || before === after) return conf;
  const word = conf.trim();
  if (after === "LEAN" && /^strong$/i.test(word)) return "Lean";
  if (after === "PASS" && /^(strong|lean)$/i.test(word)) return "Pass";
  return conf;
}
