import "server-only";

import { chicagoToday } from "@/lib/calendar-time";
import {
  ideaSlug,
  isIdeaStatus,
  parseIdeaPatch,
  parseIdeaWrite,
  presentIdeas,
  toIdeaJson,
  type Idea,
  type IdeaJson,
  type IdeaPatch,
  type IdeaStatus,
  type IdeaWrite,
} from "@/lib/future-ideas";
import { sqlQuery } from "@/lib/pg/client";

type IdeaRow = {
  id: string;
  title: string;
  note: string;
  status: string;
  tags: unknown;
  added_on: string | Date;
  archived_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const IDEA_SQL = `SELECT id, title, note, status, tags, added_on, archived_at, created_at, updated_at
  FROM future_ideas`;

function asIso(value: string | Date | null): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function asDate(value: string | Date): string {
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asTags(value: unknown): string[] {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === "string");
}

function asStatus(value: string): IdeaStatus {
  return isIdeaStatus(value) ? value : "idea";
}

function mapRow(row: IdeaRow): Idea {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    status: asStatus(row.status),
    tags: asTags(row.tags),
    addedOn: asDate(row.added_on),
    archivedAt: asIso(row.archived_at),
    createdAt: asIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: asIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

export async function readIdeas(): Promise<Idea[]> {
  const rows = await sqlQuery<IdeaRow>(`${IDEA_SQL} ORDER BY added_on DESC, id`);
  return rows.map(mapRow);
}

async function readIdea(id: string): Promise<Idea | null> {
  const rows = await sqlQuery<IdeaRow>(`${IDEA_SQL} WHERE id = $1`, [id]);
  const row = rows[0];
  return row ? mapRow(row) : null;
}

async function nextId(title: string): Promise<string> {
  const base = ideaSlug(title);
  const rows = await sqlQuery<{ id: string }>(
    `SELECT id FROM future_ideas WHERE id = $1 OR id LIKE $2`,
    [base, `${base}-%`],
  );
  const taken = new Set(rows.map((row) => row.id));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const id = `${base}-${n}`.slice(0, 80);
    if (!taken.has(id)) return id;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 80);
}

async function insertIdea(id: string, input: IdeaWrite): Promise<Idea> {
  const rows = await sqlQuery<IdeaRow>(
    `INSERT INTO future_ideas (id, title, note, status, tags, added_on, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::date, now(), now())
     RETURNING id, title, note, status, tags, added_on, archived_at, created_at, updated_at`,
    [id, input.title, input.note, input.status, JSON.stringify(input.tags), input.addedOn],
  );
  const row = rows[0];
  if (!row) throw new Error("Idea was not stored.");
  return mapRow(row);
}

async function updateIdea(current: Idea, patch: IdeaPatch): Promise<Idea> {
  const archivedAt =
    patch.archived === undefined ? current.archivedAt : patch.archived ? new Date().toISOString() : null;
  const rows = await sqlQuery<IdeaRow>(
    `UPDATE future_ideas
     SET title = $2,
         note = $3,
         status = $4,
         tags = $5::jsonb,
         added_on = $6::date,
         archived_at = $7,
         updated_at = now()
     WHERE id = $1
     RETURNING id, title, note, status, tags, added_on, archived_at, created_at, updated_at`,
    [
      current.id,
      patch.title ?? current.title,
      patch.note ?? current.note,
      patch.status ?? current.status,
      JSON.stringify(patch.tags ?? current.tags),
      patch.addedOn ?? current.addedOn,
      archivedAt,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("Idea was not stored.");
  return mapRow(row);
}

export async function loadIdeaBoard(publicMode: boolean, archivedOnly: boolean) {
  const ideas = await readIdeas();
  return presentIdeas(ideas, { publicMode, archivedOnly });
}

export async function createIdea(
  body: unknown,
  now = new Date(),
): Promise<{ ok: true; idea: IdeaJson } | { ok: false; status: number; error: string }> {
  const parsed = parseIdeaWrite(body, chicagoToday(now));
  if (!parsed.ok) return parsed;
  const stored = await insertIdea(await nextId(parsed.value.title), parsed.value);
  const idea = toIdeaJson(stored, false);
  if (!idea) return { ok: false, status: 500, error: "Idea was not stored." };
  return { ok: true, idea };
}

export async function patchIdea(
  body: unknown,
): Promise<{ ok: true; idea: IdeaJson } | { ok: false; status: number; error: string }> {
  const parsed = parseIdeaPatch(body);
  if (!parsed.ok) return parsed;
  const current = await readIdea(parsed.value.id);
  if (!current) return { ok: false, status: 404, error: "Idea was not found." };
  const stored = await updateIdea(current, parsed.value);
  const idea = toIdeaJson(stored, false);
  if (!idea) return { ok: false, status: 500, error: "Idea was not stored." };
  return { ok: true, idea };
}

export function ideaJsonList(ideas: readonly Idea[], publicMode: boolean): IdeaJson[] {
  const json: IdeaJson[] = [];
  for (const idea of ideas) {
    const row = toIdeaJson(idea, publicMode);
    if (row) json.push(row);
  }
  return json;
}
