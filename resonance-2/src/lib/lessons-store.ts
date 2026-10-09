import "server-only";

import {
  lessonLinksByBuildItem,
  lessonsHomeCard,
  lessonsPayload,
  parseLessonPatch,
  parseLessonWrite,
  splitLessonPost,
  toLessonCard,
  toLessonJson,
  visibleLessons,
  type Lesson,
  type LessonJson,
  type LessonPatch,
  type LessonWrite,
  type LessonsHomeModel,
} from "@/lib/lessons";
import { loadBuildView } from "@/lib/build-store";
import { sqlQuery } from "@/lib/pg/client";
import { isPublicMode, requestIsPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

type LessonRow = {
  id: string;
  date: string | Date;
  title: string;
  category: string;
  what_changed: string;
  why: string;
  lesson: string;
  public_safe: boolean | string;
  sources: unknown;
  build_item_id: string | null;
  pr_number: number | string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const LESSON_SQL = `SELECT id, date, title, category, what_changed, why, lesson, public_safe, sources,
  build_item_id, pr_number, created_at, updated_at
  FROM lessons
  ORDER BY date DESC, id DESC`;

function asIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date(0).toISOString();
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

function asSources(value: unknown): string[] {
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

function asBool(value: boolean | string): boolean {
  return value === true || value === "t" || value === "true";
}

function mapRow(row: LessonRow): Lesson {
  const prRaw = row.pr_number == null || row.pr_number === "" ? null : Number(row.pr_number);
  return {
    id: row.id,
    date: asDate(row.date),
    title: row.title,
    category: row.category,
    whatChanged: row.what_changed,
    why: row.why,
    lesson: row.lesson,
    publicSafe: asBool(row.public_safe),
    sources: asSources(row.sources),
    buildItemId: row.build_item_id,
    prNumber: prRaw != null && Number.isFinite(prRaw) ? prRaw : null,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

export async function readLessons(): Promise<Lesson[]> {
  const rows = await sqlQuery<LessonRow>(LESSON_SQL);
  return rows.map(mapRow);
}

async function buildItemExists(id: string): Promise<boolean> {
  const rows = await sqlQuery<{ id: string }>(`SELECT id FROM build_items WHERE id = $1`, [id]);
  return rows.length > 0;
}

async function unknownBuildItem(id: string | null): Promise<string | null> {
  if (!id) return null;
  if (await buildItemExists(id)) return null;
  return "Unknown build item.";
}

async function upsertLesson(input: LessonWrite): Promise<Lesson> {
  const rows = await sqlQuery<LessonRow>(
    `INSERT INTO lessons (
       id, date, title, category, what_changed, why, lesson, public_safe, sources,
       build_item_id, pr_number, created_at, updated_at
     )
     VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       date = EXCLUDED.date,
       title = EXCLUDED.title,
       category = EXCLUDED.category,
       what_changed = EXCLUDED.what_changed,
       why = EXCLUDED.why,
       lesson = EXCLUDED.lesson,
       public_safe = EXCLUDED.public_safe,
       sources = EXCLUDED.sources,
       build_item_id = EXCLUDED.build_item_id,
       pr_number = EXCLUDED.pr_number,
       updated_at = now()
     RETURNING id, date, title, category, what_changed, why, lesson, public_safe, sources,
       build_item_id, pr_number, created_at, updated_at`,
    [
      input.id,
      input.date,
      input.title,
      input.category,
      input.whatChanged,
      input.why,
      input.lesson,
      input.publicSafe,
      JSON.stringify(input.sources),
      input.buildItemId,
      input.prNumber,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("Lesson was not stored.");
  return mapRow(row);
}

export type LessonWriteResult =
  | { ok: true; many: false; lesson: LessonJson }
  | { ok: true; many: true; upserted: number; lessons: LessonJson[] }
  | { ok: false; status: number; error: string };

export async function writeLessons(body: unknown): Promise<LessonWriteResult> {
  const split = splitLessonPost(body);
  if (!split.ok) return { ok: false, status: 400, error: split.error };
  const parsed: LessonWrite[] = [];
  for (const entry of split.value.bodies) {
    const lesson = parseLessonWrite(entry);
    if (!lesson.ok) {
      const id =
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        "id" in entry &&
        typeof entry.id === "string"
          ? entry.id
          : "lesson";
      return { ok: false, status: 400, error: `${id}: ${lesson.error}` };
    }
    parsed.push(lesson.value);
  }
  for (const lesson of parsed) {
    const missing = await unknownBuildItem(lesson.buildItemId);
    if (missing) return { ok: false, status: 400, error: `${lesson.id}: ${missing}` };
  }
  const stored: Lesson[] = [];
  for (const lesson of parsed) stored.push(await upsertLesson(lesson));
  if (!split.value.many) {
    const lesson = stored[0];
    if (!lesson) return { ok: false, status: 500, error: "Lesson was not stored." };
    return { ok: true, many: false, lesson: toLessonJson(lesson, false) };
  }
  return {
    ok: true,
    many: true,
    upserted: stored.length,
    lessons: stored.map((lesson) => toLessonJson(lesson, false)),
  };
}

export async function patchLesson(
  body: unknown,
): Promise<{ ok: true; lesson: LessonJson } | { ok: false; status: number; error: string }> {
  const parsed = parseLessonPatch(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const patch: LessonPatch = parsed.value;
  const current = (await readLessons()).find((lesson) => lesson.id === patch.id);
  if (!current) return { ok: false, status: 404, error: "Lesson was not found." };
  const next: LessonWrite = {
    id: current.id,
    date: patch.date ?? current.date,
    title: patch.title ?? current.title,
    category: patch.category ?? current.category,
    whatChanged: patch.whatChanged ?? current.whatChanged,
    why: patch.why ?? current.why,
    lesson: patch.lesson ?? current.lesson,
    publicSafe: patch.publicSafe ?? current.publicSafe,
    sources: patch.sources ?? current.sources,
    buildItemId: patch.buildItemId === undefined ? current.buildItemId : patch.buildItemId,
    prNumber: patch.prNumber === undefined ? current.prNumber : patch.prNumber,
  };
  const missing = await unknownBuildItem(next.buildItemId);
  if (missing) return { ok: false, status: 400, error: missing };
  const stored = await upsertLesson(next);
  return { ok: true, lesson: toLessonJson(stored, false) };
}

async function buildSectionByItem(): Promise<Map<string, string>> {
  try {
    const view = await loadBuildView();
    return new Map(view.items.map((item) => [item.id, item.node]));
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return new Map();
  }
}

export async function loadLessonPage() {
  const publicMode = await isPublicMode();
  const [lessons, sections] = await Promise.all([
    readLessons().then((rows) => visibleLessons(rows, publicMode)),
    buildSectionByItem(),
  ]);
  return {
    publicMode,
    count: lessons.length,
    cards: lessons.map((lesson) =>
      toLessonCard(lesson, !publicMode, lesson.buildItemId ? (sections.get(lesson.buildItemId) ?? null) : null),
    ),
  };
}

export async function loadLessonsHome(): Promise<LessonsHomeModel> {
  const publicMode = await isPublicMode();
  const lessons = visibleLessons(await readLessons(), publicMode);
  return { unavailable: false, ...lessonsHomeCard(lessons) };
}

export async function loadLessonLinks(): Promise<Record<string, string>> {
  const publicMode = await isPublicMode();
  return lessonLinksByBuildItem(visibleLessons(await readLessons(), publicMode));
}

export async function loadLessonsPayload(request: Request) {
  const publicMode = await requestIsPublicMode(request);
  return lessonsPayload(await readLessons(), publicMode);
}
