import "server-only";

import { readLessons } from "@/lib/lessons-store";
import { sqlQuery } from "@/lib/pg/client";
import {
  isBrickStatus,
  presentBricks,
  type BrickEpisode,
  type BrickItem,
  type BrickOverlay,
  type BrickRow,
  type BrickStatus,
  type BrickCardCounts,
  brickCounts,
} from "@/lib/youtube-bricks";

type ItemRow = {
  id: string;
  title: string;
  node: string;
  pr_number: number | string | null;
  sort_order: number | string;
};

type OverlayRow = {
  brick_id: string;
  status: string;
  video_url: string | null;
  note: string | null;
  updated_at?: string | Date;
};

function asStatus(value: string): BrickStatus {
  return isBrickStatus(value) ? value : "idea";
}

function asNumber(value: number | string | null): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asIso(value: string | Date | undefined): string {
  if (value == null) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date(0).toISOString();
  return date.toISOString();
}

async function readBuildItems(): Promise<BrickItem[]> {
  const rows = await sqlQuery<ItemRow>(
    `SELECT id, title, node, pr_number, sort_order FROM build_items ORDER BY title, id`,
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    node: row.node,
    prNumber: asNumber(row.pr_number),
    sortOrder: asNumber(row.sort_order) ?? 0,
  }));
}

async function readOverlays(): Promise<BrickOverlay[]> {
  const rows = await sqlQuery<OverlayRow>(
    `SELECT brick_id, status, video_url, note FROM youtube_brick_episodes`,
  );
  return rows.map((row) => ({
    brickId: row.brick_id,
    status: asStatus(row.status),
    videoUrl: row.video_url,
    note: row.note,
  }));
}

/** Titles come from build_items. Lesson text comes from lessons. The overlay is status, video, and note. */
export async function loadBrickRows(publicMode: boolean): Promise<BrickRow[]> {
  const [items, lessons, overlays] = await Promise.all([readBuildItems(), readLessons(), readOverlays()]);
  return presentBricks({ items, lessons, overlays }, publicMode);
}

export async function loadBrickCounts(): Promise<BrickCardCounts> {
  const rows = await sqlQuery<{ status: string }>(
    `SELECT COALESCE(e.status, 'idea') AS status
     FROM build_items b
     LEFT JOIN youtube_brick_episodes e ON e.brick_id = b.id`,
  );
  return brickCounts(rows.map((row) => ({ status: asStatus(row.status) })));
}

export async function loadBrick(id: string, publicMode: boolean): Promise<BrickRow | null> {
  const rows = await loadBrickRows(publicMode);
  return rows.find((row) => row.id === id) ?? null;
}

function toEpisode(row: OverlayRow): BrickEpisode {
  return {
    brickId: row.brick_id,
    status: asStatus(row.status),
    videoUrl: row.video_url,
    note: row.note,
    updatedAt: asIso(row.updated_at),
  };
}

/**
 * Upsert the overlay for one build item. Omitted video and note stay as stored.
 * A missing overlay starts at idea. The build item title is not written.
 */
export async function saveBrickEpisode(input: {
  brickId: string;
  status?: BrickStatus;
  videoUrl?: string | null;
  note?: string | null;
}): Promise<{ ok: true; episode: BrickEpisode } | { ok: false; status: number; error: string }> {
  const found = await sqlQuery<{ id: string }>(`SELECT id FROM build_items WHERE id = $1`, [input.brickId]);
  if (!found[0]) return { ok: false, status: 404, error: "No build item with that id." };

  const existing = await sqlQuery<OverlayRow>(
    `SELECT brick_id, status, video_url, note FROM youtube_brick_episodes WHERE brick_id = $1`,
    [input.brickId],
  );
  const current = existing[0];
  const status = input.status ?? (current ? asStatus(current.status) : "idea");
  const videoUrl = input.videoUrl === undefined ? (current?.video_url ?? null) : input.videoUrl;
  const note = input.note === undefined ? (current?.note ?? null) : input.note;

  const saved = await sqlQuery<OverlayRow>(
    `INSERT INTO youtube_brick_episodes (brick_id, status, video_url, note, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (brick_id) DO UPDATE
     SET status = EXCLUDED.status,
         video_url = EXCLUDED.video_url,
         note = EXCLUDED.note,
         updated_at = now()
     RETURNING brick_id, status, video_url, note, updated_at`,
    [input.brickId, status, videoUrl, note],
  );
  const row = saved[0];
  if (!row) return { ok: false, status: 500, error: "Brick Tracker is unavailable." };
  return { ok: true, episode: toEpisode(row) };
}
