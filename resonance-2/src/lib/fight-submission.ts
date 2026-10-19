import { formatKoPercent, methodSplit, parseCount } from "@/lib/fight-ko-gate";
import { hasMoneyText } from "@/lib/public-mode";
import { personSlug } from "@/lib/ufc332";

/** Shown when Fight Desk did not post the figure. Never a zero and never a guess. */
export const NOT_RECORDED = "not recorded";

/**
 * Opponent grappling lines. They sit with KO% and R1 finishes.
 * Rates already stored under these labels stay on the same words.
 */
export const SUBMISSION_STAT_LABELS = [
  "Sub wins",
  "Sub win %",
  "Times submitted",
  "Sub attempts/15 min",
  "Takedowns/15 min",
  "TD accuracy",
  "TD defense",
  "Control time",
] as const;

export type SubmissionStatLabel = (typeof SUBMISSION_STAT_LABELS)[number];

const PERCENT_LABELS = new Set<SubmissionStatLabel>(["Sub win %", "TD accuracy", "TD defense"]);

const ALIASES: Record<SubmissionStatLabel, readonly string[]> = {
  "Sub wins": ["wins_sub", "sub_wins", "subWins", "Sub wins"],
  "Sub win %": ["sub_win_pct", "subWinPct", "sub_pct", "subWinPercent", "Sub win %"],
  "Times submitted": ["loss_sub", "times_submitted", "timesSubmitted", "Times submitted"],
  "Sub attempts/15 min": ["subavg", "sub_avg", "subAttempts", "sub_attempts", "Sub attempts/15 min"],
  "Takedowns/15 min": ["tdavg", "td_avg", "tdAvg", "Takedowns/15 min"],
  "TD accuracy": ["tdacc", "td_acc", "tdAcc", "TD accuracy"],
  "TD defense": ["tddef", "td_def", "tdDef", "TD defense"],
  "Control time": ["ctrl", "control", "control_time", "controlTime", "ctrl_per_fight", "Control time"],
};

const WIN_SPLIT = ["Wins (KO/Sub/Dec)", "Wins KO / Sub / Dec"] as const;
const LOSS_SPLIT = ["Losses (KO/Sub/Dec)", "Losses KO / Sub / Dec"] as const;

export type SubmissionRow = {
  label: SubmissionStatLabel;
  value: string;
  recorded: boolean;
};

export type SubmissionBoard = {
  name: string;
  /** Opponent of the posted lean. A fighter board is used when the lean does not name a side. */
  role: "opponent" | "fighter";
  ko: string;
  r1: string;
  stats: SubmissionRow[];
};

export function isSubmissionLabel(label: string): boolean {
  return (SUBMISSION_STAT_LABELS as readonly string[]).includes(label);
}

function blankish(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    !text ||
    text === "—" ||
    text === "-" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === NOT_RECORDED ||
    lower.startsWith("not found")
  );
}

/** Posted figure. A blank, a dash, or a dollar amount is missing. A posted zero stays zero. */
export function presentSubmissionValue(value: unknown, label: SubmissionStatLabel): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    const text = String(value);
    return PERCENT_LABELS.has(label) ? `${text}%` : text;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (blankish(text) || hasMoneyText(text)) return null;
  if (PERCENT_LABELS.has(label) && /^\d+(?:\.\d+)?$/.test(text)) return `${text}%`;
  return text;
}

function recordWins(raw: Record<string, unknown>): number | null {
  const record =
    (typeof raw.record === "string" && raw.record) ||
    (typeof raw.ufc_record === "string" && raw.ufc_record) ||
    "";
  const match = /^(\d+)\s*-\s*\d+/.exec(record.trim());
  if (!match?.[1]) return null;
  const wins = Number(match[1]);
  return Number.isFinite(wins) ? wins : null;
}

/** Sub wins over wins, only when both counts were posted. A zero-win record stays unset. */
function subWinPercent(raw: Record<string, unknown>, subWins: string | undefined): string | null {
  const sub =
    parseCount(subWins) ??
    parseCount(raw.wins_sub) ??
    parseCount(raw.sub_wins) ??
    parseCount(raw.subWins);
  if (sub == null) return null;
  const ko = parseCount(raw.wins_ko) ?? parseCount(raw.winsKo);
  const dec = parseCount(raw.wins_dec) ?? parseCount(raw.winsDec);
  const postedSub = parseCount(raw.wins_sub) ?? parseCount(raw.sub_wins) ?? parseCount(raw.subWins);
  let total: number | null = null;
  if (ko != null && dec != null && postedSub != null) total = ko + postedSub + dec;
  else total = recordWins(raw);
  if (total == null || total <= 0 || sub > total) return null;
  return formatKoPercent((sub * 100) / total);
}

/** Labels a fighter or opponent object actually carried. Omitted keys are left out. */
export function submissionStatMap(raw: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const label of SUBMISSION_STAT_LABELS) {
    for (const key of ALIASES[label]) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
      const printed = presentSubmissionValue(raw[key], label);
      if (printed) {
        out[label] = printed;
        break;
      }
    }
  }
  if (!out["Sub win %"]) {
    const computed = subWinPercent(raw, out["Sub wins"]);
    if (computed) out["Sub win %"] = computed;
  }
  return out;
}

export function mergeSubmissionStats(
  base: Record<string, string>,
  extra: Record<string, string>,
): Record<string, string> {
  const next = { ...base };
  for (const [label, value] of Object.entries(extra)) {
    if (!next[label]) next[label] = value;
  }
  return next;
}

function splitValue(stats: Record<string, string>, labels: readonly string[]): ReturnType<typeof methodSplit> {
  for (const label of labels) {
    const split = methodSplit(stats[label] ?? "");
    if (split) return split;
  }
  return null;
}

/** Dedicated labels, then the KO/Sub/Dec line when that line was stored. */
export function submissionFromStatMap(stats: Record<string, string> | null | undefined): Record<string, string> {
  const source = stats ?? {};
  const out: Record<string, string> = {};
  for (const label of SUBMISSION_STAT_LABELS) {
    const printed = presentSubmissionValue(source[label], label);
    if (printed) out[label] = printed;
  }
  const wins = splitValue(source, WIN_SPLIT);
  const losses = splitValue(source, LOSS_SPLIT);
  if (!out["Sub wins"] && wins) out["Sub wins"] = String(wins.sub);
  if (!out["Times submitted"] && losses) out["Times submitted"] = String(losses.sub);
  if (!out["Sub win %"] && wins) {
    const total = wins.ko + wins.sub + wins.dec;
    if (total > 0) out["Sub win %"] = formatKoPercent((wins.sub * 100) / total);
  }
  return out;
}

export function submissionRows(recorded: Record<string, string>): SubmissionRow[] {
  return SUBMISSION_STAT_LABELS.map((label) => {
    const value = recorded[label];
    if (!value) return { label, value: NOT_RECORDED, recorded: false };
    return { label, value, recorded: true };
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function statRecord(value: Record<string, string> | readonly { label: string; value: string }[] | null | undefined): Record<string, string> {
  if (!value) return {};
  if (Array.isArray(value)) {
    const out: Record<string, string> = {};
    for (const row of value) {
      if (row && typeof row.label === "string") out[row.label] = row.value;
    }
    return out;
  }
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

function samePerson(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left?.trim() || !right?.trim()) return false;
  const a = personSlug(left);
  const b = personSlug(right);
  if (a && a === b) return true;
  const hay = left.trim().toLowerCase();
  const needle = right.trim().toLowerCase();
  return hay === needle || hay.includes(needle) || needle.includes(hay);
}

function finishText(stats: Record<string, string>, label: string): string {
  const value = stats[label]?.trim() ?? "";
  if (!value || value === "—" || value.toLowerCase() === "n/a") return "n/a";
  if (hasMoneyText(value)) return "n/a";
  return value;
}

function board(
  name: string,
  role: SubmissionBoard["role"],
  recorded: Record<string, string>,
  raw: Record<string, string>,
): SubmissionBoard {
  return {
    name: name.trim() || (role === "opponent" ? "Opponent" : "Fighter"),
    role,
    ko: finishText(raw, "KO%"),
    r1: finishText(raw, "R1 finishes"),
    stats: submissionRows(recorded),
  };
}

/**
 * One opponent board when the lean or pick names a side.
 * Otherwise both fighters, each under their own name.
 */
export function submissionBoards(input: {
  aName?: string | null;
  bName?: string | null;
  lean?: string | null;
  pick?: string | null;
  aStats?: Record<string, string> | readonly { label: string; value: string }[] | null;
  bStats?: Record<string, string> | readonly { label: string; value: string }[] | null;
}): SubmissionBoard[] {
  const aRaw = statRecord(input.aStats);
  const bRaw = statRecord(input.bStats);
  const aName = input.aName?.trim() || "A";
  const bName = input.bName?.trim() || "B";
  const named = input.lean?.trim() || input.pick?.trim() || "";
  const aHit = named ? samePerson(aName, named) : false;
  const bHit = named ? samePerson(bName, named) : false;
  if (aHit && !bHit) return [board(bName, "opponent", submissionFromStatMap(bRaw), bRaw)];
  if (bHit && !aHit) return [board(aName, "opponent", submissionFromStatMap(aRaw), aRaw)];
  return [
    board(aName, "fighter", submissionFromStatMap(aRaw), aRaw),
    board(bName, "fighter", submissionFromStatMap(bRaw), bRaw),
  ];
}

/** Opponent block on a fight. Empty when the object was omitted or carried no figures. */
export function readOpponentBlock(value: unknown): { name: string | null; stats: Record<string, string> } | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const stats = submissionStatMap(raw);
  if (Object.keys(stats).length === 0) return null;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;
  return { name, stats };
}
