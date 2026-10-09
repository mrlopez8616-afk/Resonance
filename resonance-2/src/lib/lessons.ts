/**
 * Lessons learned. Percent-free copy: what changed, why, and the lesson.
 * Public mode hides a row that is not public_safe, hides a row that contains
 * a dollar amount, and never includes sources.
 */

import { pullHref } from "@/lib/build-tracker";

export const FOUNDERS_CALL = "Founder's call.";

export const LESSON_ID = /^LL-\d{3}$/;
const BUILD_ITEM_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const LESSON_CAPS = {
  title: 160,
  category: 40,
  whatChanged: 4000,
  why: 4000,
  lesson: 4000,
  source: 300,
  sources: 20,
} as const;

export type Lesson = {
  id: string;
  date: string;
  title: string;
  category: string;
  whatChanged: string;
  why: string;
  lesson: string;
  publicSafe: boolean;
  sources: string[];
  buildItemId: string | null;
  prNumber: number | null;
  createdAt: string;
  updatedAt: string;
};

export type LessonWrite = {
  id: string;
  date: string;
  title: string;
  category: string;
  whatChanged: string;
  why: string;
  lesson: string;
  publicSafe: boolean;
  sources: string[];
  buildItemId: string | null;
  prNumber: number | null;
};

export type LessonPatch = {
  id: string;
  date?: string;
  title?: string;
  category?: string;
  whatChanged?: string;
  why?: string;
  lesson?: string;
  publicSafe?: boolean;
  sources?: string[];
  buildItemId?: string | null;
  prNumber?: number | null;
};

export type LessonJson = {
  id: string;
  date: string;
  title: string;
  category: string;
  what_changed: string;
  why: string;
  lesson: string;
  public_safe: boolean;
  sources?: string[];
  build_item_id: string | null;
  pr_number: number | null;
  created_at: string;
  updated_at: string;
};

export type LessonCard = {
  id: string;
  date: string;
  dateLabel: string;
  monthKey: string;
  monthLabel: string;
  title: string;
  category: string;
  whatChanged: string;
  why: string;
  lesson: string;
  sources: string[];
  buildHref: string | null;
  prHref: string | null;
  prNumber: number | null;
};

export type LessonsHomeModel = {
  unavailable: boolean;
  count: number;
  latestTitle: string | null;
};

type ParseOk<T> = { ok: true; value: T };
type ParseFail = { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cap(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

/** A dollar amount. `$argon2` and "Founder's call." are not amounts. */
export function containsDollarAmount(text: string): boolean {
  return /\$\s*\d/.test(text);
}

export function lessonHasDollarAmount(
  lesson: Pick<Lesson, "title" | "category" | "whatChanged" | "why" | "lesson">,
): boolean {
  return [lesson.title, lesson.category, lesson.whatChanged, lesson.why, lesson.lesson].some((part) =>
    containsDollarAmount(part),
  );
}

/** Public mode keeps a row only when it is marked safe and has no dollar amount. */
export function isPublicLesson(lesson: Lesson): boolean {
  return lesson.publicSafe && !lessonHasDollarAmount(lesson);
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

function parseId(value: unknown): ParseOk<string> | ParseFail {
  if (typeof value !== "string" || !LESSON_ID.test(value.trim())) {
    return { ok: false, error: "Id must look like LL-001." };
  }
  return { ok: true, value: value.trim() };
}

function parseDate(value: unknown): ParseOk<string> | ParseFail {
  if (typeof value !== "string" || !isIsoDate(value.trim())) {
    return { ok: false, error: "Date must be YYYY-MM-DD." };
  }
  return { ok: true, value: value.trim() };
}

function parseRequiredText(
  value: unknown,
  label: string,
  max: number,
): ParseOk<string> | ParseFail {
  if (typeof value !== "string") return { ok: false, error: `${label} is required.` };
  const text = cap(value, max);
  if (!text) return { ok: false, error: `${label} is required.` };
  return { ok: true, value: text };
}

/**
 * Blank reason is the founder's call, stored as that exact sentence.
 * Any other reason is stored as given, capped.
 */
function parseWhy(value: unknown, required: boolean): ParseOk<string> | ParseFail {
  if (value === undefined || value === null) {
    if (!required) return { ok: false, error: "Why is required." };
    return { ok: true, value: FOUNDERS_CALL };
  }
  if (typeof value !== "string") return { ok: false, error: "Why must be text." };
  const text = cap(value, LESSON_CAPS.why);
  return { ok: true, value: text || FOUNDERS_CALL };
}

function parseSources(value: unknown): ParseOk<string[]> | ParseFail {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: "Sources must be a list of strings." };
  const sources: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return { ok: false, error: "Sources must be a list of strings." };
    const text = cap(entry, LESSON_CAPS.source);
    if (!text) continue;
    sources.push(text);
    if (sources.length >= LESSON_CAPS.sources) break;
  }
  return { ok: true, value: sources };
}

function parsePublicSafe(value: unknown, fallback: boolean | undefined): ParseOk<boolean> | ParseFail {
  if (value === undefined) {
    if (fallback === undefined) return { ok: false, error: "public_safe must be true or false." };
    return { ok: true, value: fallback };
  }
  if (typeof value !== "boolean") return { ok: false, error: "public_safe must be true or false." };
  return { ok: true, value };
}

function parseBuildItemId(value: unknown): ParseOk<string | null> | ParseFail {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "build_item_id must be a build item id." };
  const id = value.trim();
  if (!id) return { ok: true, value: null };
  if (!BUILD_ITEM_ID.test(id)) return { ok: false, error: "build_item_id must be a build item id." };
  return { ok: true, value: id };
}

function parsePrNumber(value: unknown): ParseOk<number | null> | ParseFail {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1_000_000) {
    return { ok: false, error: "pr_number must be a pull request number." };
  }
  return { ok: true, value };
}

function fail<T>(error: string): ParseFail {
  return { ok: false, error };
}

export function parseLessonWrite(body: unknown): ParseOk<LessonWrite> | ParseFail {
  if (!isRecord(body)) return fail("Each lesson must be an object.");
  const id = parseId(body.id);
  if (!id.ok) return id;
  const date = parseDate(body.date);
  if (!date.ok) return date;
  const title = parseRequiredText(body.title, "Title", LESSON_CAPS.title);
  if (!title.ok) return title;
  const category = parseRequiredText(body.category, "Category", LESSON_CAPS.category);
  if (!category.ok) return category;
  const whatChanged = parseRequiredText(body.what_changed, "What changed", LESSON_CAPS.whatChanged);
  if (!whatChanged.ok) return whatChanged;
  const why = parseWhy(body.why, true);
  if (!why.ok) return why;
  const lesson = parseRequiredText(body.lesson, "Lesson", LESSON_CAPS.lesson);
  if (!lesson.ok) return lesson;
  const publicSafe = parsePublicSafe(body.public_safe, false);
  if (!publicSafe.ok) return publicSafe;
  const sources = parseSources(body.sources);
  if (!sources.ok) return sources;
  const buildItemId = parseBuildItemId(body.build_item_id);
  if (!buildItemId.ok) return buildItemId;
  const prNumber = parsePrNumber(body.pr_number);
  if (!prNumber.ok) return prNumber;
  return {
    ok: true,
    value: {
      id: id.value,
      date: date.value,
      title: title.value,
      category: category.value,
      whatChanged: whatChanged.value,
      why: why.value,
      lesson: lesson.value,
      publicSafe: publicSafe.value,
      sources: sources.value,
      buildItemId: buildItemId.value,
      prNumber: prNumber.value,
    },
  };
}

export function parseLessonPatch(body: unknown): ParseOk<LessonPatch> | ParseFail {
  if (!isRecord(body)) return fail("JSON object is required.");
  const id = parseId(body.id);
  if (!id.ok) return id;
  const patch: LessonPatch = { id: id.value };
  let changes = 0;
  if ("date" in body) {
    const date = parseDate(body.date);
    if (!date.ok) return date;
    patch.date = date.value;
    changes += 1;
  }
  if ("title" in body) {
    const title = parseRequiredText(body.title, "Title", LESSON_CAPS.title);
    if (!title.ok) return title;
    patch.title = title.value;
    changes += 1;
  }
  if ("category" in body) {
    const category = parseRequiredText(body.category, "Category", LESSON_CAPS.category);
    if (!category.ok) return category;
    patch.category = category.value;
    changes += 1;
  }
  if ("what_changed" in body) {
    const whatChanged = parseRequiredText(body.what_changed, "What changed", LESSON_CAPS.whatChanged);
    if (!whatChanged.ok) return whatChanged;
    patch.whatChanged = whatChanged.value;
    changes += 1;
  }
  if ("why" in body) {
    const why = parseWhy(body.why, true);
    if (!why.ok) return why;
    patch.why = why.value;
    changes += 1;
  }
  if ("lesson" in body) {
    const lesson = parseRequiredText(body.lesson, "Lesson", LESSON_CAPS.lesson);
    if (!lesson.ok) return lesson;
    patch.lesson = lesson.value;
    changes += 1;
  }
  if ("public_safe" in body) {
    const publicSafe = parsePublicSafe(body.public_safe, undefined);
    if (!publicSafe.ok) return publicSafe;
    patch.publicSafe = publicSafe.value;
    changes += 1;
  }
  if ("sources" in body) {
    const sources = parseSources(body.sources);
    if (!sources.ok) return sources;
    patch.sources = sources.value;
    changes += 1;
  }
  if ("build_item_id" in body) {
    const buildItemId = parseBuildItemId(body.build_item_id);
    if (!buildItemId.ok) return buildItemId;
    patch.buildItemId = buildItemId.value;
    changes += 1;
  }
  if ("pr_number" in body) {
    const prNumber = parsePrNumber(body.pr_number);
    if (!prNumber.ok) return prNumber;
    patch.prNumber = prNumber.value;
    changes += 1;
  }
  if (changes === 0) return fail("Send a field to change.");
  return { ok: true, value: patch };
}

export function splitLessonPost(body: unknown): ParseOk<{ many: boolean; bodies: unknown[] }> | ParseFail {
  if (Array.isArray(body)) {
    if (body.length === 0) return fail("Send at least one lesson.");
    return { ok: true, value: { many: true, bodies: body } };
  }
  if (!isRecord(body)) return fail("JSON object or array is required.");
  if (Array.isArray(body.lessons)) {
    if (body.lessons.length === 0) return fail("Send at least one lesson.");
    return { ok: true, value: { many: true, bodies: body.lessons } };
  }
  return { ok: true, value: { many: false, bodies: [body] } };
}

function byNewest(left: Lesson, right: Lesson): number {
  if (left.date !== right.date) return left.date < right.date ? 1 : -1;
  return left.id < right.id ? 1 : -1;
}

export function visibleLessons(lessons: readonly Lesson[], publicMode: boolean): Lesson[] {
  const rows = publicMode ? lessons.filter((lesson) => isPublicLesson(lesson)) : [...lessons];
  return rows.sort(byNewest);
}

export function toLessonJson(lesson: Lesson, publicMode: boolean): LessonJson {
  const row: LessonJson = {
    id: lesson.id,
    date: lesson.date,
    title: lesson.title,
    category: lesson.category,
    what_changed: lesson.whatChanged,
    why: lesson.why,
    lesson: lesson.lesson,
    public_safe: lesson.publicSafe,
    build_item_id: lesson.buildItemId,
    pr_number: lesson.prNumber,
    created_at: lesson.createdAt,
    updated_at: lesson.updatedAt,
  };
  if (!publicMode) row.sources = lesson.sources;
  return row;
}

export function lessonsPayload(lessons: readonly Lesson[], publicMode: boolean) {
  const visible = visibleLessons(lessons, publicMode);
  return {
    ok: true as const,
    public: publicMode,
    count: visible.length,
    lessons: visible.map((lesson) => toLessonJson(lesson, publicMode)),
  };
}

export function lessonsHomeCard(lessons: readonly Lesson[]): Pick<LessonsHomeModel, "count" | "latestTitle"> {
  const sorted = visibleLessons(lessons, false);
  return {
    count: sorted.length,
    latestTitle: sorted[0]?.title ?? null,
  };
}

/** Newest lesson for each build item. The link opens that entry. */
export function lessonLinksByBuildItem(lessons: readonly Lesson[]): Record<string, string> {
  const links: Record<string, string> = {};
  for (const lesson of visibleLessons(lessons, false)) {
    if (!lesson.buildItemId || links[lesson.buildItemId]) continue;
    links[lesson.buildItemId] = `/n/lessons#${lesson.id}`;
  }
  return links;
}

export function formatLessonDate(date: string): string {
  const match = ISO_DATE.exec(date);
  if (!match) return date;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(utc);
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthLabel(date: string): string {
  const match = ISO_DATE.exec(date);
  if (!match) return date;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc);
}

/** Build Tracker child page for an item. Section is the item's node. */
export function lessonBuildHref(buildItemId: string | null, section: string | null): string | null {
  if (!buildItemId) return null;
  if (!section) return "/n/build";
  return `/n/build/${section}#${buildItemId}`;
}

export function toLessonCard(
  lesson: Lesson,
  includeSources: boolean,
  buildSection: string | null = null,
): LessonCard {
  return {
    id: lesson.id,
    date: lesson.date,
    dateLabel: formatLessonDate(lesson.date),
    monthKey: monthKey(lesson.date),
    monthLabel: monthLabel(lesson.date),
    title: lesson.title,
    category: lesson.category,
    whatChanged: lesson.whatChanged,
    why: lesson.why,
    lesson: lesson.lesson,
    sources: includeSources ? lesson.sources : [],
    buildHref: lessonBuildHref(lesson.buildItemId, buildSection),
    prHref: lesson.prNumber == null ? null : pullHref(lesson.prNumber),
    prNumber: lesson.prNumber,
  };
}

export function lessonCategories(cards: readonly { category: string }[]): string[] {
  return [...new Set(cards.map((card) => card.category))].sort((left, right) => left.localeCompare(right));
}
