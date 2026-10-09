import "server-only";

import { z } from "zod";
import { loadGithubPulls } from "@/lib/build-github";
import { sqlQuery } from "@/lib/pg/client";
import {
  averageStepPercent,
  buildHomeCard,
  buildItemId,
  groupBuildItems,
  isBuildNode,
  isShippedLive,
  isBuildStatus,
  mergeSteps,
  overlayPulls,
  parseSteps,
  pullHref,
  sameSteps,
  standardSteps,
  stepPercent,
  type BuildBoard,
  type BuildHomeCard,
  type BuildItem,
  type BuildNode,
  type BuildStatus,
  type BuildStep,
} from "@/lib/build-tracker";

const STEP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ITEM_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

const statusSchema = z
  .string()
  .transform((value) => (value === "in progress" ? "in_progress" : value))
  .refine((value): value is BuildStatus => isBuildStatus(value), "Status must be live, in progress, queued, or blocked.");

const nodeSchema = z.string().refine((value): value is BuildNode => isBuildNode(value), "Unknown node.");

const stepSchema = z.object({
  id: z.string().regex(STEP_ID),
  label: z.string().min(1).max(160),
  done: z.boolean(),
});

const stepPatchSchema = z.object({
  id: z.string().regex(STEP_ID),
  label: z.string().min(1).max(160).optional(),
  done: z.boolean(),
});

const postSchema = z.object({
  id: z.string().regex(ITEM_ID).optional(),
  title: z.string().min(1).max(200),
  node: nodeSchema,
  pr_number: z.number().int().positive().nullable().optional(),
  status: statusSchema.optional(),
  steps: z.array(stepSchema).max(24).optional(),
  next_step: z.string().max(240).nullable().optional(),
  sort_order: z.number().int().min(0).max(100_000).optional(),
});

const patchSchema = z
  .object({
    id: z.string().regex(ITEM_ID),
    title: z.string().min(1).max(200).optional(),
    node: nodeSchema.optional(),
    pr_number: z.number().int().positive().nullable().optional(),
    status: statusSchema.optional(),
    steps: z.array(stepPatchSchema).min(1).max(24).optional(),
    next_step: z.string().max(240).nullable().optional(),
    sort_order: z.number().int().min(0).max(100_000).optional(),
  })
  .refine(
    (body) =>
      body.title !== undefined ||
      body.node !== undefined ||
      body.pr_number !== undefined ||
      body.status !== undefined ||
      body.steps !== undefined ||
      body.next_step !== undefined ||
      body.sort_order !== undefined,
    "Send a field to change.",
  );

export type PublicBuildItem = {
  id: string;
  title: string;
  node: BuildNode;
  pr_number: number | null;
  pr_url: string | null;
  status: BuildStatus;
  steps: BuildStep[];
  percent: number | null;
  next_step: string | null;
  sort_order: number;
  updated_at: string;
  shipped: boolean;
};

export type BuildWriteResult =
  | { ok: true; item: PublicBuildItem }
  | { ok: false; status: number; error: string };

type ItemRow = {
  id: string;
  title: string;
  node: string;
  pr_number: number | string | null;
  status: string;
  steps: unknown;
  next_step: string | null;
  sort_order: number | string;
  updated_at: string | Date;
};

function asIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date(0).toISOString();
  return date.toISOString();
}

const STORED_NODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function mapRow(row: ItemRow): BuildItem | null {
  const node = row.node.trim().toLowerCase();
  if (!isBuildStatus(row.status)) return null;
  if (!isBuildNode(node) && !STORED_NODE.test(node)) return null;
  const prRaw = row.pr_number == null || row.pr_number === "" ? null : Number(row.pr_number);
  return {
    id: row.id,
    title: row.title,
    node: node as BuildNode,
    prNumber: prRaw != null && Number.isFinite(prRaw) ? prRaw : null,
    status: row.status,
    steps: parseSteps(row.steps),
    nextStep: row.next_step?.trim() ? row.next_step.trim() : null,
    sortOrder: Number(row.sort_order),
    updatedAt: asIso(row.updated_at),
  };
}

const ITEM_SQL = `SELECT id, title, node, pr_number, status, steps, next_step, sort_order, updated_at
  FROM build_items
  ORDER BY sort_order ASC, title ASC`;

export async function readBuildItems(): Promise<BuildItem[]> {
  const rows = await sqlQuery<ItemRow>(ITEM_SQL);
  return rows.flatMap((row) => {
    const item = mapRow(row);
    return item ? [item] : [];
  });
}

async function persistOverlay(before: readonly BuildItem[], after: readonly BuildItem[]): Promise<void> {
  for (let index = 0; index < after.length; index += 1) {
    const next = after[index];
    const prev = before[index];
    if (!next || !prev) continue;
    if (sameSteps(next.steps, prev.steps) && next.prNumber === prev.prNumber) continue;
    await sqlQuery(`UPDATE build_items SET steps = $2::jsonb, pr_number = $3 WHERE id = $1`, [
      next.id,
      JSON.stringify(next.steps),
      next.prNumber,
    ]);
  }
}

export async function loadBuildItems(): Promise<{ items: BuildItem[]; githubFresh: boolean }> {
  const stored = await readBuildItems();
  const numbers = stored.flatMap((item) => (item.prNumber == null ? [] : [item.prNumber]));
  const github = await loadGithubPulls(numbers);
  if (!github.fresh) return { items: stored, githubFresh: false };
  const overlaid = overlayPulls(stored, github.pulls);
  await persistOverlay(stored, overlaid);
  return { items: overlaid, githubFresh: true };
}

export async function loadBuildBoard(now = new Date()): Promise<BuildBoard> {
  const loaded = await loadBuildItems();
  const grouped = groupBuildItems(loaded.items, now);
  return { ...grouped, githubFresh: loaded.githubFresh };
}

/** Items plus the overall step percent. The parent and child pages share this. */
export async function loadBuildView(now = new Date()): Promise<{
  items: BuildItem[];
  totalPercent: number | null;
  githubFresh: boolean;
}> {
  const loaded = await loadBuildItems();
  return {
    items: loaded.items,
    totalPercent: averageStepPercent(loaded.items),
    githubFresh: loaded.githubFresh,
  };
}

export async function loadBuildHomeCard(): Promise<BuildHomeCard> {
  const loaded = await loadBuildItems();
  return buildHomeCard(loaded.items);
}

export function toPublicItem(item: BuildItem, now = new Date()): PublicBuildItem {
  const shipped = isShippedLive(item, now);
  return {
    id: item.id,
    title: item.title,
    node: item.node,
    pr_number: item.prNumber,
    pr_url: item.prNumber == null ? null : pullHref(item.prNumber),
    status: item.status,
    steps: item.steps,
    percent: stepPercent(item.steps),
    next_step: item.nextStep,
    sort_order: item.sortOrder,
    updated_at: item.updatedAt,
    shipped,
  };
}

export function boardJson(board: BuildBoard, items: readonly BuildItem[], now = new Date()) {
  const publicItems = new Map(items.map((item) => [item.id, toPublicItem(item, now)]));
  return {
    ok: true as const,
    total_percent: board.totalPercent,
    github: board.githubFresh ? ("fresh" as const) : ("stored" as const),
    groups: board.groups.map((group) => ({
      node: group.node,
      label: group.label,
      percent: group.percent,
      items: [...group.active, ...group.shipped].map((item) => publicItems.get(item.id)),
    })),
  };
}

function cleanText(value: string): string {
  return value.trim();
}

export async function createBuildItem(body: unknown, now = new Date()): Promise<BuildWriteResult> {
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? "Invalid build item." };
  }
  const input = parsed.data;
  const title = cleanText(input.title);
  if (!title) return { ok: false, status: 400, error: "Title is required." };
  if (input.steps && input.steps.length === 0) {
    return { ok: false, status: 400, error: "Steps are required so the percent is real." };
  }
  const steps = (input.steps ?? standardSteps()).map((step) => ({
    id: step.id,
    label: cleanText(step.label),
    done: step.done,
  }));
  if (steps.some((step) => !step.label)) {
    return { ok: false, status: 400, error: "Each step needs a label." };
  }
  const id = input.id ?? buildItemId(input.node, title);
  if (!ITEM_ID.test(id)) return { ok: false, status: 400, error: "Id is not a slug." };
  const existing = await sqlQuery<{ id: string }>(`SELECT id FROM build_items WHERE id = $1`, [id]);
  if (existing.length > 0) return { ok: false, status: 409, error: "That build item already exists." };
  let sortOrder = input.sort_order;
  if (sortOrder === undefined) {
    const maxRows = await sqlQuery<{ max: number | string | null }>(
      `SELECT COALESCE(MAX(sort_order), 0) AS max FROM build_items`,
    );
    sortOrder = Number(maxRows[0]?.max ?? 0) + 10;
  }
  const nextStep =
    input.next_step === undefined || input.next_step === null ? null : cleanText(input.next_step) || null;
  const status = input.status ?? "queued";
  await sqlQuery(
    `INSERT INTO build_items (id, title, node, pr_number, status, steps, next_step, sort_order, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
    [
      id,
      title,
      input.node,
      input.pr_number ?? null,
      status,
      JSON.stringify(steps),
      nextStep,
      sortOrder,
      now.toISOString(),
    ],
  );
  const created = (await readBuildItems()).find((item) => item.id === id);
  if (!created) return { ok: false, status: 500, error: "Build item was not stored." };
  return { ok: true, item: toPublicItem(created, now) };
}

export async function patchBuildItem(body: unknown, now = new Date()): Promise<BuildWriteResult> {
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? "Invalid build item." };
  }
  const input = parsed.data;
  const current = (await readBuildItems()).find((item) => item.id === input.id);
  if (!current) return { ok: false, status: 404, error: "Build item was not found." };
  let steps = current.steps;
  if (input.steps) {
    const patch = input.steps.map((step) => ({
      id: step.id,
      label: step.label ? cleanText(step.label) : "",
      done: step.done,
    }));
    for (const step of patch) {
      const exists = steps.some((row) => row.id === step.id);
      if (!exists && !step.label) {
        return { ok: false, status: 400, error: "New steps need a label." };
      }
    }
    steps = mergeSteps(steps, patch);
  }
  const title = input.title === undefined ? current.title : cleanText(input.title);
  if (!title) return { ok: false, status: 400, error: "Title is required." };
  const nextStep =
    input.next_step === undefined
      ? current.nextStep
      : input.next_step === null
        ? null
        : cleanText(input.next_step) || null;
  await sqlQuery(
    `UPDATE build_items
     SET title = $2, node = $3, pr_number = $4, status = $5, steps = $6::jsonb, next_step = $7, sort_order = $8, updated_at = $9
     WHERE id = $1`,
    [
      current.id,
      title,
      input.node ?? current.node,
      input.pr_number === undefined ? current.prNumber : input.pr_number,
      input.status ?? current.status,
      JSON.stringify(steps),
      nextStep,
      input.sort_order ?? current.sortOrder,
      now.toISOString(),
    ],
  );
  const updated = (await readBuildItems()).find((item) => item.id === current.id);
  if (!updated) return { ok: false, status: 500, error: "Build item was not stored." };
  return { ok: true, item: toPublicItem(updated, now) };
}
