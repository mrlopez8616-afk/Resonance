import { SECRET_OR_ACCOUNT_ERROR, textLooksSecret } from "@/lib/approvals";
import { hasMoneyText, stripMoneyText } from "@/lib/public-mode";

/**
 * Future Ideas bulletin. Titles and notes are plain text.
 * Public mode keeps the words and drops dollar amounts. Archived rows stay off that screen.
 */

export const IDEA_HREF = "/n/ideas";

export const IDEA_STATUSES = ["idea", "someday", "queued", "done"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IDEA_CAPS = {
  title: 160,
  note: 2000,
  tag: 24,
  tags: 8,
} as const;

const IDEA_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_RATE = /\$\s?1\s*\/\s*day/gi;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const FUTURE_IDEA_SEED = [
  {
    id: "driving-tracker",
    title: "Driving-tracker node",
    note: "A node that tracks driving.",
    status: "idea",
    tags: ["node"],
    addedOn: "2026-10-11",
  },
  {
    id: "resonance-shell",
    title: "Resonance shell / membership product",
    note: "Mirrors the nine nodes and the treasury. Founder's notes. Adopt or stay. Not financial advice. A possible bridge to the Jake Claver mastermind.",
    status: "idea",
    tags: ["product"],
    addedOn: "2026-10-11",
  },
  {
    id: "per-node-dca",
    title: "$1/day per-node DCA once cash is steady",
    note: "A daily buy on each node, once cash is steady.",
    status: "someday",
    tags: ["dca"],
    addedOn: "2026-10-11",
  },
  {
    id: "resonance-world",
    title: "Resonance world / game-view",
    note: "Agents as town characters. The Founder character is user-controlled. Brainstorm only, and not queued to build.",
    status: "idea",
    tags: ["brainstorm"],
    addedOn: "2026-10-11",
  },
  {
    id: "chart-time-range",
    title: "Chart time-range",
    note: "Already shipped (#99).",
    status: "done",
    tags: ["shipped"],
    addedOn: "2026-10-11",
  },
  {
    id: "health-of-the-machine",
    title: "Health of the Machine",
    note: "Already shipped (#98).",
    status: "done",
    tags: ["shipped"],
    addedOn: "2026-10-11",
  },
] as const satisfies readonly {
  id: string;
  title: string;
  note: string;
  status: IdeaStatus;
  tags: readonly string[];
  addedOn: string;
}[];

export function seedIdeas(): Idea[] {
  return FUTURE_IDEA_SEED.map((seed) => ({
    id: seed.id,
    title: seed.title,
    note: seed.note,
    status: seed.status,
    tags: [...seed.tags],
    addedOn: seed.addedOn,
    archivedAt: null,
    createdAt: "2026-10-11T17:00:00.000Z",
    updatedAt: "2026-10-11T17:00:00.000Z",
  }));
}

export type Idea = {
  id: string;
  title: string;
  note: string;
  status: IdeaStatus;
  tags: string[];
  addedOn: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IdeaCard = {
  id: string;
  title: string;
  note: string;
  status: IdeaStatus;
  statusLabel: string;
  tags: string[];
  addedOn: string;
  addedLabel: string;
  archived: boolean;
};

export type IdeaJson = {
  id: string;
  title: string;
  note: string;
  status: IdeaStatus;
  tags: string[];
  added_on: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type IdeaWrite = {
  title: string;
  note: string;
  status: IdeaStatus;
  tags: string[];
  addedOn: string;
};

export type IdeaPatch = {
  id: string;
  title?: string;
  note?: string;
  status?: IdeaStatus;
  tags?: string[];
  addedOn?: string;
  archived?: boolean;
};

type ParseOk<T> = { ok: true; value: T };
type ParseFail = { ok: false; status: number; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(error: string, status = 400): ParseFail {
  return { ok: false, status, error };
}

function cap(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

export function isIdeaId(value: string): boolean {
  return IDEA_ID.test(value);
}

export function isIdeaStatus(value: string): value is IdeaStatus {
  return (IDEA_STATUSES as readonly string[]).includes(value);
}

export function ideaStatusLabel(status: IdeaStatus): string {
  if (status === "idea") return "Idea";
  if (status === "someday") return "Someday";
  if (status === "queued") return "Queued";
  return "Done";
}

export function ideaListHref(status: IdeaStatus | "all", archived = false): string {
  if (archived) return `${IDEA_HREF}?show=archived`;
  if (status === "all") return IDEA_HREF;
  return `${IDEA_HREF}?status=${status}`;
}

export function parseIdeaStatusFilter(value: string | undefined): IdeaStatus | "all" {
  if (!value || value === "all") return "all";
  return isIdeaStatus(value) ? value : "all";
}

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

export function ideaDateLabel(iso: string): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

/** A slug for a new row. Dollar signs and punctuation become hyphens. */
export function ideaSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug && isIdeaId(slug) ? slug : "idea";
}

/**
 * Public copy. `$1/day` is spoken out so the idea stays readable.
 * Any other dollar amount is removed. A secret-shaped string becomes empty.
 */
export function publicIdeaText(value: string): string {
  if (textLooksSecret(value)) return "";
  const spoken = value.replace(DAY_RATE, "one dollar a day");
  const stripped = stripMoneyText(spoken).replace(/\s{2,}/g, " ").trim();
  if (!stripped || hasMoneyText(stripped) || stripped.includes("$") || textLooksSecret(stripped)) return "";
  return stripped;
}

function cleanTags(tags: readonly string[], publicMode: boolean): string[] {
  const next: string[] = [];
  for (const tag of tags) {
    const text = publicMode ? publicIdeaText(tag) : tag.trim();
    if (!text) continue;
    next.push(text);
  }
  return next;
}

export function presentIdeas(
  rows: readonly Idea[],
  options: { publicMode: boolean; archivedOnly?: boolean },
): IdeaCard[] {
  const archivedOnly = options.publicMode ? false : Boolean(options.archivedOnly);
  const pool = rows.filter((row) => {
    const archived = row.archivedAt !== null;
    if (options.publicMode && archived) return false;
    return archivedOnly ? archived : !archived;
  });
  const cards: IdeaCard[] = [];
  for (const row of pool) {
    const title = options.publicMode ? publicIdeaText(row.title) : row.title.trim();
    if (!title) continue;
    const note = options.publicMode ? publicIdeaText(row.note) : row.note.trim();
    cards.push({
      id: row.id,
      title,
      note,
      status: row.status,
      statusLabel: ideaStatusLabel(row.status),
      tags: cleanTags(row.tags, options.publicMode),
      addedOn: row.addedOn,
      addedLabel: ideaDateLabel(row.addedOn),
      archived: row.archivedAt !== null,
    });
  }
  const rank = new Map<IdeaStatus, number>(IDEA_STATUSES.map((status, index) => [status, index]));
  cards.sort((left, right) => {
    if (archivedOnly) {
      if (left.addedOn !== right.addedOn) return left.addedOn < right.addedOn ? 1 : -1;
      return left.title.localeCompare(right.title);
    }
    const status = (rank.get(left.status) ?? 0) - (rank.get(right.status) ?? 0);
    if (status !== 0) return status;
    if (left.addedOn !== right.addedOn) return left.addedOn < right.addedOn ? 1 : -1;
    return left.title.localeCompare(right.title);
  });
  return cards;
}

export function ideaGroups(
  cards: readonly IdeaCard[],
  filter: IdeaStatus | "all",
): { status: IdeaStatus; label: string; cards: IdeaCard[] }[] {
  const statuses = filter === "all" ? IDEA_STATUSES : [filter];
  return statuses.flatMap((status) => {
    const rows = cards.filter((card) => card.status === status);
    if (rows.length === 0 && status !== filter) return [];
    return [{ status, label: ideaStatusLabel(status), cards: rows }];
  });
}

export function toIdeaJson(idea: Idea, publicMode: boolean): IdeaJson | null {
  const cards = presentIdeas([idea], { publicMode, archivedOnly: publicMode ? false : idea.archivedAt !== null });
  const card = cards[0];
  if (!card) return null;
  if (publicMode && idea.archivedAt) return null;
  return {
    id: card.id,
    title: card.title,
    note: card.note,
    status: card.status,
    tags: card.tags,
    added_on: card.addedOn,
    archived: publicMode ? false : card.archived,
    created_at: idea.createdAt,
    updated_at: idea.updatedAt,
  };
}

function pick(body: Record<string, unknown>, snake: string, camel: string): unknown {
  if (snake in body) return body[snake];
  if (camel in body) return body[camel];
  return undefined;
}

function parseTitle(value: unknown): ParseOk<string> | ParseFail {
  if (typeof value !== "string") return fail("Title is required.");
  const title = cap(value, IDEA_CAPS.title);
  if (!title) return fail("Title is required.");
  if (textLooksSecret(title)) return fail(SECRET_OR_ACCOUNT_ERROR);
  return { ok: true, value: title };
}

function parseNote(value: unknown): ParseOk<string> | ParseFail {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string") return fail("Note must be text.");
  const note = cap(value, IDEA_CAPS.note);
  if (textLooksSecret(note)) return fail(SECRET_OR_ACCOUNT_ERROR);
  return { ok: true, value: note };
}

function parseStatus(value: unknown, fallback: IdeaStatus | null): ParseOk<IdeaStatus> | ParseFail {
  if (value === undefined || value === null || value === "") {
    if (fallback) return { ok: true, value: fallback };
    return fail("Status must be idea, someday, queued, or done.");
  }
  if (typeof value !== "string" || !isIdeaStatus(value)) {
    return fail("Status must be idea, someday, queued, or done.");
  }
  return { ok: true, value };
}

function parseTag(value: string): string | null {
  const tag = cap(value, IDEA_CAPS.tag).toLowerCase().replace(/\s+/g, "-");
  if (!tag) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(tag)) return null;
  if (textLooksSecret(tag)) return null;
  return tag;
}

function parseTags(value: unknown): ParseOk<string[]> | ParseFail {
  if (value === undefined || value === null) return { ok: true, value: [] };
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : null;
  if (!raw) return fail("Tags must be a list of short words.");
  const tags: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") return fail("Tags must be a list of short words.");
    const tag = parseTag(entry);
    if (!tag || tags.includes(tag)) continue;
    tags.push(tag);
    if (tags.length >= IDEA_CAPS.tags) break;
  }
  return { ok: true, value: tags };
}

function parseAddedOn(value: unknown, fallback: string | null): ParseOk<string> | ParseFail {
  if (value === undefined || value === null || value === "") {
    if (fallback) return { ok: true, value: fallback };
    return fail("Date must be YYYY-MM-DD.");
  }
  if (typeof value !== "string" || !isIsoDate(value.trim())) return fail("Date must be YYYY-MM-DD.");
  return { ok: true, value: value.trim() };
}

export function parseIdeaWrite(body: unknown, today: string): ParseOk<IdeaWrite> | ParseFail {
  if (!isRecord(body)) return fail("JSON object is required.");
  if ("id" in body) return fail("A new idea does not take an id.");
  const title = parseTitle(body.title);
  if (!title.ok) return title;
  const note = parseNote(pick(body, "note", "note"));
  if (!note.ok) return note;
  const status = parseStatus(body.status, "idea");
  if (!status.ok) return status;
  const tags = parseTags(body.tags);
  if (!tags.ok) return tags;
  const addedOn = parseAddedOn(pick(body, "added_on", "addedOn"), today);
  if (!addedOn.ok) return addedOn;
  return {
    ok: true,
    value: {
      title: title.value,
      note: note.value,
      status: status.value,
      tags: tags.value,
      addedOn: addedOn.value,
    },
  };
}

export function parseIdeaPatch(body: unknown): ParseOk<IdeaPatch> | ParseFail {
  if (!isRecord(body)) return fail("JSON object is required.");
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!isIdeaId(id)) return fail("Unknown idea.");
  const patch: IdeaPatch = { id };
  if ("title" in body) {
    const title = parseTitle(body.title);
    if (!title.ok) return title;
    patch.title = title.value;
  }
  if ("note" in body) {
    const note = parseNote(body.note);
    if (!note.ok) return note;
    patch.note = note.value;
  }
  if ("status" in body) {
    const status = parseStatus(body.status, null);
    if (!status.ok) return status;
    patch.status = status.value;
  }
  if ("tags" in body) {
    const tags = parseTags(body.tags);
    if (!tags.ok) return tags;
    patch.tags = tags.value;
  }
  if ("added_on" in body || "addedOn" in body) {
    const addedOn = parseAddedOn(pick(body, "added_on", "addedOn"), null);
    if (!addedOn.ok) return addedOn;
    patch.addedOn = addedOn.value;
  }
  if ("archived" in body) {
    if (typeof body.archived !== "boolean") return fail("Archived must be true or false.");
    patch.archived = body.archived;
  }
  const changes = Object.keys(patch).filter((key) => key !== "id");
  if (changes.length === 0) return fail("Nothing to change.");
  return { ok: true, value: patch };
}
