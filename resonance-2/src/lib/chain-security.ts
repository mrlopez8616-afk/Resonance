import { hasMoneyText, stripMoneyText } from "@/lib/public-mode";

/**
 * Chain Security. A weekly incident feed.
 * Bridge exploits sort first, then chain or protocol bugs,
 * wallet and hardware attacks, then confirmed AI or quantum attacks.
 * Loss is a single dollar amount, a low-high range, none, or not recorded.
 * Public mode never receives a dollar amount.
 */

export const CHAIN_SECURITY_HREF = "/n/chain-security";
export const SOURCE_PENDING = "source pending";
export const LOSS_HIDDEN = "hidden";
export const NOT_RECORDED = "not recorded";
export const LOSS_NONE = "none";

export const INCIDENT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const CATEGORIES = ["bridge_exploit", "chain_bug", "wallet_hardware", "ai_quantum"] as const;
export type IncidentCategory = (typeof CATEGORIES)[number];

export const LOSS_KINDS = ["amount", "range", "not_recorded", "none"] as const;
export type LossKind = (typeof LOSS_KINDS)[number];

export const EXPOSURES = ["flare-fxrp", "xrpl"] as const;
export type ExposureId = (typeof EXPOSURES)[number];

const CATEGORY_LABEL: Record<IncidentCategory, string> = {
  bridge_exploit: "Bridge exploit",
  chain_bug: "Chain / protocol bug",
  wallet_hardware: "Wallet / hardware",
  ai_quantum: "AI or quantum",
};

const CATEGORY_ALIAS: Record<string, IncidentCategory> = {
  bridge_exploit: "bridge_exploit",
  "bridge exploit": "bridge_exploit",
  "bridge exploits": "bridge_exploit",
  chain_bug: "chain_bug",
  "chain bug": "chain_bug",
  "chain/protocol bug": "chain_bug",
  "chain / protocol bug": "chain_bug",
  "protocol bug": "chain_bug",
  wallet_hardware: "wallet_hardware",
  "wallet/hardware": "wallet_hardware",
  "wallet / hardware": "wallet_hardware",
  "wallet hardware": "wallet_hardware",
  ai_quantum: "ai_quantum",
  "ai or quantum": "ai_quantum",
  "ai-driven": "ai_quantum",
  quantum: "ai_quantum",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SUBJECT_MAX = 160;
const CAUSE_MAX = 2000;
const STATUS_MAX = 80;
const URL_MAX = 500;

export type IncidentLoss = {
  kind: LossKind;
  low: number | null;
  high: number | null;
};

export type IncidentRecord = {
  id: string;
  occurredOn: string | null;
  subject: string;
  category: IncidentCategory;
  cause: string;
  loss: IncidentLoss;
  status: string;
  sourceUrl: string | null;
  exposures: ExposureId[];
};

export type IncidentView = {
  id: string;
  href: string;
  occurredOn: string | null;
  dateLabel: string;
  subject: string;
  category: IncidentCategory;
  categoryLabel: string;
  cause: string;
  lossLabel: string;
  status: string;
  sourceUrl: string | null;
  sourceLabel: string;
};

export type ExposureWatch = {
  id: ExposureId;
  label: string;
  incidents: IncidentView[];
};

export type ChainSecurityFeed = {
  count: number;
  countLabel: string;
  watches: ExposureWatch[];
  groups: { category: IncidentCategory; label: string; incidents: IncidentView[] }[];
};

export type ChainSecurityHomeModel = {
  unavailable: boolean;
  count: number;
  lines: string[];
};

export type IncidentJson = {
  id: string;
  occurred_on: string | null;
  date: string;
  subject: string;
  category: IncidentCategory;
  category_label: string;
  cause: string;
  loss: string;
  loss_kind?: LossKind;
  loss_low?: number | null;
  loss_high?: number | null;
  status: string;
  source_url: string | null;
  source_label: string;
  exposures: ExposureId[];
  href: string;
};

type ParseFail = { ok: false; status: number; error: string };

export type IncidentWrite = {
  id: string;
  occurredOn: string | null;
  subject: string;
  category: IncidentCategory;
  cause: string;
  loss: IncidentLoss;
  status: string;
  sourceUrl: string | null;
  exposures: ExposureId[];
};

export function isIncidentId(value: string): boolean {
  return INCIDENT_ID.test(value);
}

export function incidentHref(id: string): string {
  return `${CHAIN_SECURITY_HREF}/${id}`;
}

export function categoryLabel(category: IncidentCategory): string {
  return CATEGORY_LABEL[category];
}

export function categoryRank(category: IncidentCategory): number {
  return CATEGORIES.indexOf(category);
}

export function isExposureId(value: string): value is ExposureId {
  return (EXPOSURES as readonly string[]).includes(value);
}

export function exposureLabel(id: ExposureId): string {
  if (id === "flare-fxrp") return "Flare FXRP bridge";
  return "XRPL";
}

export function formatIncidentDay(day: string | null): string {
  if (!day) return NOT_RECORDED;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return NOT_RECORDED;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return NOT_RECORDED;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

/** Compact dollars. 730000 is $730K. 1760000 is $1.76M. 3800000 is $3.8M. */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return NOT_RECORDED;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${trimNumber(abs / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `${sign}$${trimNumber(abs / 1_000, 1)}K`;
  return `${sign}$${abs.toLocaleString("en-US")}`;
}

function trimNumber(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

export function formatLoss(loss: IncidentLoss): string {
  if (loss.kind === "none") return LOSS_NONE;
  if (loss.kind === "not_recorded" || loss.low == null) return NOT_RECORDED;
  if (loss.kind === "range" && loss.high != null) return `${formatUsd(loss.low)}\u2013${formatUsd(loss.high)}`;
  return formatUsd(loss.low);
}

export function incidentTouches(incident: Pick<IncidentRecord, "subject" | "exposures">, id: ExposureId): boolean {
  if (incident.exposures.includes(id)) return true;
  const subject = incident.subject.toLowerCase();
  if (id === "xrpl") return /\bxrpl\b/.test(subject) || subject.includes("xrp ledger");
  return subject.includes("fxrp") || /\bflare\b/.test(subject);
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function publicText(value: string, publicMode: boolean): string {
  if (!publicMode) return value;
  return stripMoneyText(value);
}

export function presentIncident(incident: IncidentRecord, publicMode: boolean): IncidentView {
  const cause = publicText(incident.cause, publicMode);
  const subject = publicText(incident.subject, publicMode) || incident.subject;
  const status = publicText(incident.status, publicMode) || incident.status;
  return {
    id: incident.id,
    href: incidentHref(incident.id),
    occurredOn: incident.occurredOn,
    dateLabel: formatIncidentDay(incident.occurredOn),
    subject,
    category: incident.category,
    categoryLabel: categoryLabel(incident.category),
    cause,
    lossLabel: publicMode ? LOSS_HIDDEN : formatLoss(incident.loss),
    status,
    sourceUrl: incident.sourceUrl,
    sourceLabel: incident.sourceUrl ?? SOURCE_PENDING,
  };
}

export function compareIncidents(left: IncidentRecord, right: IncidentRecord): number {
  const rank = categoryRank(left.category) - categoryRank(right.category);
  if (rank !== 0) return rank;
  if (left.occurredOn && right.occurredOn && left.occurredOn !== right.occurredOn) {
    return left.occurredOn < right.occurredOn ? 1 : -1;
  }
  if (left.occurredOn && !right.occurredOn) return -1;
  if (!left.occurredOn && right.occurredOn) return 1;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

export function exposureWatches(incidents: readonly IncidentRecord[], publicMode: boolean): ExposureWatch[] {
  const ordered = [...incidents].sort(compareIncidents);
  return EXPOSURES.map((id) => ({
    id,
    label: exposureLabel(id),
    incidents: ordered
      .filter((incident) => incidentTouches(incident, id))
      .map((incident) => presentIncident(incident, publicMode)),
  }));
}

export function presentFeed(incidents: readonly IncidentRecord[], publicMode: boolean): ChainSecurityFeed {
  const ordered = [...incidents].sort(compareIncidents);
  const groups: ChainSecurityFeed["groups"] = [];
  for (const incident of ordered) {
    const view = presentIncident(incident, publicMode);
    const last = groups[groups.length - 1];
    if (!last || last.category !== incident.category) {
      groups.push({ category: incident.category, label: view.categoryLabel, incidents: [view] });
    } else {
      last.incidents.push(view);
    }
  }
  const count = ordered.length;
  const countLabel = count === 0 ? "No incidents yet." : count === 1 ? "1 incident" : `${count} incidents`;
  return {
    count,
    countLabel,
    watches: exposureWatches(ordered, publicMode),
    groups,
  };
}

export function chainSecurityHomeModel(
  incidents: readonly IncidentRecord[],
  options: { unavailable?: boolean; publicMode?: boolean } = {},
): ChainSecurityHomeModel {
  if (options.unavailable) return { unavailable: true, count: 0, lines: [] };
  const publicMode = options.publicMode === true;
  const ordered = [...incidents].sort(compareIncidents);
  const lines: string[] = [];
  for (const watch of exposureWatches(ordered, publicMode)) {
    if (watch.incidents.length === 0) continue;
    const first = watch.incidents[0];
    const line =
      watch.incidents.length === 1 && first
        ? `${watch.label} \u00b7 ${first.status}`
        : `${watch.label} \u00b7 ${watch.incidents.length}`;
    const safe = publicMode && hasMoneyText(line) ? null : line;
    if (safe) lines.push(safe);
  }
  const newest = [...ordered].sort((left, right) => {
    if (left.occurredOn && right.occurredOn && left.occurredOn !== right.occurredOn) {
      return left.occurredOn < right.occurredOn ? 1 : -1;
    }
    if (left.occurredOn && !right.occurredOn) return -1;
    if (!left.occurredOn && right.occurredOn) return 1;
    return 0;
  })[0];
  if (newest && lines.length < 3) {
    const subject = publicText(newest.subject, publicMode);
    if (subject && !lines.some((line) => line.includes(subject))) lines.push(subject);
  }
  return {
    unavailable: false,
    count: ordered.length,
    lines: lines
      .filter((line) => (publicMode ? !hasMoneyText(line) : true))
      .slice(0, 3),
  };
}

export function toIncidentJson(incident: IncidentRecord, publicMode: boolean): IncidentJson {
  const view = presentIncident(incident, publicMode);
  const json: IncidentJson = {
    id: incident.id,
    occurred_on: incident.occurredOn,
    date: view.dateLabel,
    subject: view.subject,
    category: incident.category,
    category_label: view.categoryLabel,
    cause: view.cause,
    loss: view.lossLabel,
    status: view.status,
    source_url: incident.sourceUrl,
    source_label: view.sourceLabel,
    exposures: incident.exposures,
    href: view.href,
  };
  if (!publicMode) {
    json.loss_kind = incident.loss.kind;
    json.loss_low = incident.loss.low;
    json.loss_high = incident.loss.high;
  }
  return json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(error: string, status = 400): ParseFail {
  return { ok: false, status, error };
}

function parseCategory(value: unknown): IncidentCategory | null {
  if (typeof value !== "string") return null;
  return CATEGORY_ALIAS[clean(value).toLowerCase()] ?? null;
}

function parseDay(value: unknown): { ok: true; day: string | null } | ParseFail {
  if (value == null || value === "" || value === NOT_RECORDED) return { ok: true, day: null };
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail("occurred_on is YYYY-MM-DD or null.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return fail("occurred_on is not a real date.");
  }
  return { ok: true, day: value };
}

function parseMoney(value: unknown): number | null | ParseFail {
  if (value == null || value === "") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000_000_000) {
    return fail("Loss amounts are zero or a positive number of dollars.");
  }
  return number;
}

function parseLoss(body: Record<string, unknown>): { ok: true; loss: IncidentLoss } | ParseFail {
  const named = typeof body.loss === "string" ? clean(body.loss).toLowerCase().replace(/\s+/g, "_") : "";
  if (named === "none") return { ok: true, loss: { kind: "none", low: null, high: null } };
  if (named === "not_recorded" || named === "hidden") {
    return { ok: true, loss: { kind: "not_recorded", low: null, high: null } };
  }
  if (named) return fail("loss is none, not recorded, or omit it and send loss_low.");
  const low = parseMoney(body.loss_low);
  if (low && typeof low === "object") return low;
  const high = parseMoney(body.loss_high);
  if (high && typeof high === "object") return high;
  if (low == null && high == null) return { ok: true, loss: { kind: "not_recorded", low: null, high: null } };
  if (low == null && high != null) return fail("A high loss needs loss_low.");
  if (high == null) return { ok: true, loss: { kind: "amount", low: low as number, high: null } };
  if ((high as number) < (low as number)) return fail("loss_high is below loss_low.");
  return { ok: true, loss: { kind: "range", low: low as number, high: high as number } };
}

function parseSource(value: unknown): { ok: true; url: string | null } | ParseFail {
  if (value == null || value === "") return { ok: true, url: null };
  if (typeof value !== "string") return fail("source_url is an http(s) URL or null.");
  const text = value.trim();
  if (!text || text.toLowerCase() === SOURCE_PENDING) return { ok: true, url: null };
  if (text.length > URL_MAX) return fail("source_url is too long.");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return fail("source_url is an http(s) URL or null.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return fail("source_url is an http(s) URL or null.");
  }
  if (!url.hostname || url.username || url.password) return fail("source_url is an http(s) URL or null.");
  return { ok: true, url: url.toString() };
}

function parseExposures(value: unknown): { ok: true; exposures: ExposureId[] } | ParseFail {
  if (value == null) return { ok: true, exposures: [] };
  if (!Array.isArray(value)) return fail("exposures is a list of flare-fxrp and xrpl.");
  const exposures: ExposureId[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isExposureId(item)) {
      return fail("exposures is a list of flare-fxrp and xrpl.");
    }
    if (!exposures.includes(item)) exposures.push(item);
  }
  return { ok: true, exposures };
}

/** Full row. The same id updates the stored incident. */
export function parseIncidentWrite(body: unknown): { ok: true; incident: IncidentWrite } | ParseFail {
  if (!isRecord(body)) return fail("JSON object is required.");
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!isIncidentId(id)) return fail("Id is a lowercase slug.");
  const subject = typeof body.subject === "string" ? clean(body.subject) : "";
  if (!subject || subject.length > SUBJECT_MAX) return fail("subject is the chain or bridge.");
  const category = parseCategory(body.category);
  if (!category) return fail("category is bridge_exploit, chain_bug, wallet_hardware, or ai_quantum.");
  const cause = typeof body.cause === "string" ? clean(body.cause) : "";
  if (!cause || cause.length > CAUSE_MAX) return fail("cause is required.");
  const day = parseDay(body.occurred_on);
  if (!day.ok) return day;
  const loss = parseLoss(body);
  if (!loss.ok) return loss;
  const statusRaw = typeof body.status === "string" ? clean(body.status) : "";
  const status = statusRaw || NOT_RECORDED;
  if (status.length > STATUS_MAX) return fail("status is too long.");
  const source = parseSource(body.source_url);
  if (!source.ok) return source;
  const exposures = parseExposures(body.exposures);
  if (!exposures.ok) return exposures;
  return {
    ok: true,
    incident: {
      id,
      occurredOn: day.day,
      subject,
      category,
      cause,
      loss: loss.loss,
      status,
      sourceUrl: source.url,
      exposures: exposures.exposures,
    },
  };
}
