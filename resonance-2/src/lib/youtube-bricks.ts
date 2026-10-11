import { SECRET_OR_ACCOUNT_ERROR, payloadLooksSecret, textLooksSecret } from "@/lib/approvals";
import { lessonBuildHref, isPublicLesson, type Lesson } from "@/lib/lessons";
import { pullHref } from "@/lib/build-tracker";
import { hasMoneyText, stripMoneyText } from "@/lib/public-mode";

/**
 * Brick Tracker. Every build_items row is an episode.
 * The overlay stores status, an optional video URL, and an optional note.
 * Titles and lesson text are read from build_items and lessons. They are not copied.
 */

export const BRICK_STATUSES = ["idea", "scripted", "filmed", "posted"] as const;
export type BrickStatus = (typeof BRICK_STATUSES)[number];

export const BRICK_HREF = "/n/youtube/bricks";
export const NO_LESSON = "no lesson linked";
export const SUMMARY_WITHHELD = "Summary withheld";

export const BRICK_CAPS = {
  note: 500,
  videoUrl: 300,
} as const;

const BRICK_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function isBrickId(value: string): boolean {
  return BRICK_ID.test(value);
}

export function isBrickStatus(value: string): value is BrickStatus {
  return (BRICK_STATUSES as readonly string[]).includes(value);
}

export function brickStatusLabel(status: BrickStatus): string {
  if (status === "idea") return "Idea";
  if (status === "scripted") return "Scripted";
  if (status === "filmed") return "Filmed";
  return "Posted";
}

export function brickHref(id: string): string {
  return `${BRICK_HREF}/${id}`;
}

export function brickListHref(status: BrickStatus | "all"): string {
  if (status === "all") return BRICK_HREF;
  return `${BRICK_HREF}?status=${status}`;
}

export function parseBrickStatusFilter(value: string | undefined): BrickStatus | "all" {
  if (!value || value === "all") return "all";
  return isBrickStatus(value) ? value : "all";
}

export type BrickItem = {
  id: string;
  title: string;
  node: string;
  prNumber: number | null;
  sortOrder: number;
};

export type BrickOverlay = {
  brickId: string;
  status: BrickStatus;
  videoUrl: string | null;
  note: string | null;
};

export type BrickRow = {
  id: string;
  title: string;
  status: BrickStatus;
  summary: string;
  buildHref: string;
  prHref: string | null;
  prNumber: number | null;
  lessonHref: string | null;
  lessonId: string | null;
  lessonLabel: string;
  videoUrl: string | null;
  note: string | null;
};

export type BrickJson = {
  id: string;
  title: string;
  status: BrickStatus;
  summary: string;
  build_href: string;
  pr_href: string | null;
  pr_number: number | null;
  lesson_href: string | null;
  lesson_id: string | null;
  lesson_label: string;
  video_url: string | null;
  note: string | null;
};

export type BrickCardCounts = Record<BrickStatus, number> & { total: number };

export type BrickEpisode = {
  brickId: string;
  status: BrickStatus;
  videoUrl: string | null;
  note: string | null;
  updatedAt: string;
};

type ParseFail = { ok: false; status: number; error: string };

export type BrickWrite = {
  brickId: string;
  status: BrickStatus;
  videoUrl: string | null | undefined;
  note: string | null | undefined;
};

export type BrickPatch = {
  brickId: string;
  status?: BrickStatus;
  videoUrl?: string | null;
  note?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(error: string, status = 400): ParseFail {
  return { ok: false, status, error };
}

function byNewest(left: Lesson, right: Lesson): number {
  if (left.date !== right.date) return left.date < right.date ? 1 : -1;
  return left.id < right.id ? 1 : -1;
}

/**
 * The only link is lessons.build_item_id. Same title or the same pull request
 * number does not count. Newest linked lesson wins. Public mode keeps a lesson
 * only when it is marked public-safe and has no dollar amount.
 */
export function linkedLesson(
  brickId: string,
  lessons: readonly Lesson[],
  publicMode: boolean,
): Lesson | null {
  const matches = lessons.filter((lesson) => lesson.buildItemId === brickId);
  const pool = publicMode ? matches.filter((lesson) => isPublicLesson(lesson)) : matches;
  return [...pool].sort(byNewest)[0] ?? null;
}

function safeText(value: string, publicMode: boolean): string | null {
  if (!value.trim() || textLooksSecret(value)) return null;
  const text = publicMode ? stripMoneyText(value) : value.trim();
  if (!text || textLooksSecret(text) || (publicMode && (hasMoneyText(text) || text.includes("$")))) return null;
  return text;
}

function summaryFor(title: string, lesson: Lesson | null, publicMode: boolean): string {
  const lessonText =
    lesson && !textLooksSecret(lesson.lesson) && (!publicMode || isPublicLesson(lesson))
      ? lesson.lesson
      : "";
  const fromLesson = lessonText ? safeText(lessonText, publicMode) : null;
  if (fromLesson) return fromLesson;
  const fromTitle = safeText(title, publicMode);
  return fromTitle ?? SUMMARY_WITHHELD;
}

function visibleNote(note: string | null, publicMode: boolean): string | null {
  if (!note) return null;
  return safeText(note, publicMode);
}

function visibleVideo(url: string | null, publicMode: boolean): string | null {
  if (!url) return null;
  return safeText(url, publicMode);
}

export function presentBricks(
  input: {
    items: readonly BrickItem[];
    lessons: readonly Lesson[];
    overlays: readonly BrickOverlay[];
  },
  publicMode: boolean,
): BrickRow[] {
  const overlays = new Map(input.overlays.map((row) => [row.brickId, row]));
  const rows = input.items.map((item) => {
    const overlay = overlays.get(item.id);
    const lesson = linkedLesson(item.id, input.lessons, publicMode);
    const buildHref = lessonBuildHref(item.id, item.node) ?? "/n/build";
    return {
      id: item.id,
      title: item.title,
      status: overlay?.status ?? "idea",
      summary: summaryFor(item.title, lesson, publicMode),
      buildHref,
      prHref: publicMode || item.prNumber == null ? null : pullHref(item.prNumber),
      prNumber: publicMode || item.prNumber == null ? null : item.prNumber,
      lessonHref: lesson ? `/n/lessons#${lesson.id}` : null,
      lessonId: lesson?.id ?? null,
      lessonLabel: lesson ? lesson.id : NO_LESSON,
      videoUrl: visibleVideo(overlay?.videoUrl ?? null, publicMode),
      note: visibleNote(overlay?.note ?? null, publicMode),
    };
  });
  return rows.sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
}

export function toBrickJson(row: BrickRow): BrickJson {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    summary: row.summary,
    build_href: row.buildHref,
    pr_href: row.prHref,
    pr_number: row.prNumber,
    lesson_href: row.lessonHref,
    lesson_id: row.lessonId,
    lesson_label: row.lessonLabel,
    video_url: row.videoUrl,
    note: row.note,
  };
}

export function brickCounts(rows: readonly { status: BrickStatus }[]): BrickCardCounts {
  const counts: BrickCardCounts = { total: rows.length, idea: 0, scripted: 0, filmed: 0, posted: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/** Parent-card figure. Lines prefer posted, filmed, and scripted, then idea. At most three. */
export function brickParentCard(counts: BrickCardCounts): { figure: string; lines: string[]; live: boolean } {
  if (counts.total === 0) return { figure: "No bricks", lines: [], live: false };
  const figure = counts.total === 1 ? "1 brick" : `${counts.total} bricks`;
  const order: BrickStatus[] = ["posted", "filmed", "scripted", "idea"];
  const lines = order
    .filter((status) => counts[status] > 0)
    .slice(0, 3)
    .map((status) => `${counts[status]} ${status}`);
  return { figure, lines, live: true };
}

export type BrickGroup = {
  status: BrickStatus;
  label: string;
  rows: BrickRow[];
};

export function brickGroups(rows: readonly BrickRow[], filter: BrickStatus | "all"): BrickGroup[] {
  const visible = filter === "all" ? rows : rows.filter((row) => row.status === filter);
  return BRICK_STATUSES.map((status) => ({
    status,
    label: brickStatusLabel(status),
    rows: visible
      .filter((row) => row.status === status)
      .slice()
      .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)),
  })).filter((group) => group.rows.length > 0);
}

export function brickFiltersVisible(counts: BrickCardCounts, filter: BrickStatus | "all"): boolean {
  const used = BRICK_STATUSES.filter((status) => counts[status] > 0).length;
  return used > 1 || filter !== "all";
}

function parseBrickId(value: unknown): { ok: true; value: string } | ParseFail {
  if (typeof value !== "string" || !isBrickId(value.trim())) {
    return fail("brick_id must be a build item id.");
  }
  return { ok: true, value: value.trim() };
}

function parseStatus(value: unknown, required: boolean): { ok: true; value: BrickStatus | undefined } | ParseFail {
  if (value === undefined) {
    if (required) return fail("Status must be idea, scripted, filmed, or posted.");
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string" || !isBrickStatus(value)) {
    return fail("Status must be idea, scripted, filmed, or posted.");
  }
  return { ok: true, value };
}

function parseVideo(value: unknown, present: boolean): { ok: true; value: string | null | undefined } | ParseFail {
  if (!present) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return fail("Video URL must be an https link.");
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  if (text.length > BRICK_CAPS.videoUrl) return fail("Video URL is too long.");
  if (textLooksSecret(text)) return fail(SECRET_OR_ACCOUNT_ERROR);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return fail("Video URL must be an https link.");
  }
  if (url.protocol !== "https:") return fail("Video URL must be an https link.");
  return { ok: true, value: url.toString() };
}

function parseNote(value: unknown, present: boolean): { ok: true; value: string | null | undefined } | ParseFail {
  if (!present) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return fail("Note must be plain text.");
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  if (text.length > BRICK_CAPS.note) return fail("Note is too long.");
  if (textLooksSecret(text)) return fail(SECRET_OR_ACCOUNT_ERROR);
  return { ok: true, value: text };
}

const WRITE_KEYS = new Set(["brick_id", "status", "video_url", "note"]);

function parseCommon(body: unknown): { ok: true; record: Record<string, unknown> } | ParseFail {
  if (payloadLooksSecret(body)) return fail(SECRET_OR_ACCOUNT_ERROR);
  if (!isRecord(body)) return fail("JSON object is required.");
  for (const key of Object.keys(body)) {
    if (!WRITE_KEYS.has(key)) return fail("Unknown field.");
  }
  return { ok: true, record: body };
}

export function parseBrickPost(body: unknown): { ok: true; value: BrickWrite } | ParseFail {
  const common = parseCommon(body);
  if (!common.ok) return common;
  const brickId = parseBrickId(common.record.brick_id);
  if (!brickId.ok) return brickId;
  const status = parseStatus(common.record.status, true);
  if (!status.ok || !status.value) return status.ok ? fail("Status must be idea, scripted, filmed, or posted.") : status;
  const video = parseVideo(common.record.video_url, Object.prototype.hasOwnProperty.call(common.record, "video_url"));
  if (!video.ok) return video;
  const note = parseNote(common.record.note, Object.prototype.hasOwnProperty.call(common.record, "note"));
  if (!note.ok) return note;
  return {
    ok: true,
    value: { brickId: brickId.value, status: status.value, videoUrl: video.value, note: note.value },
  };
}

export function parseBrickPatch(body: unknown): { ok: true; value: BrickPatch } | ParseFail {
  const common = parseCommon(body);
  if (!common.ok) return common;
  const brickId = parseBrickId(common.record.brick_id);
  if (!brickId.ok) return brickId;
  const hasStatus = Object.prototype.hasOwnProperty.call(common.record, "status");
  const hasVideo = Object.prototype.hasOwnProperty.call(common.record, "video_url");
  const hasNote = Object.prototype.hasOwnProperty.call(common.record, "note");
  if (!hasStatus && !hasVideo && !hasNote) return fail("Send a field to change.");
  const status = parseStatus(hasStatus ? common.record.status : undefined, false);
  if (!status.ok) return status;
  const video = parseVideo(common.record.video_url, hasVideo);
  if (!video.ok) return video;
  const note = parseNote(common.record.note, hasNote);
  if (!note.ok) return note;
  const patch: BrickPatch = { brickId: brickId.value };
  if (status.value) patch.status = status.value;
  if (hasVideo) patch.videoUrl = video.value ?? null;
  if (hasNote) patch.note = note.value ?? null;
  return { ok: true, value: patch };
}
