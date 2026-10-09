import { fills, type Fill } from "@/data/fills";

export function listFills(rows: readonly Fill[] = fills): Fill[] {
  return [...rows].sort((a, b) => {
    const delta = Date.parse(b.time) - Date.parse(a.time);
    if (delta !== 0) return delta;
    const keyA = a.idempotencyKey ?? a.orderId;
    const keyB = b.idempotencyKey ?? b.orderId;
    return keyB.localeCompare(keyA);
  });
}

/** Stable row identity for the operator log. Seed rows predate venue keys. */
export function fillRowKey(fill: Fill): string {
  return fill.idempotencyKey ?? `${fill.venue ?? "seed"}:${fill.orderId}`;
}

/**
 * A stored sleeve or venue column fills a payload that omitted the field.
 * A null column stays null. This does not guess a sleeve.
 */
export function overlayStoredFillFields(
  payload: unknown,
  stored: { sleeve?: string | null; venue?: string | null },
): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const fill = payload as Record<string, unknown>;
  if (fill.kind === "bet" || fill.kind === "transfer") return payload;
  const next = { ...fill };
  const sleeve = stored.sleeve?.trim() ?? "";
  const venue = stored.venue?.trim() ?? "";
  if ((next.sleeve == null || next.sleeve === "") && sleeve) next.sleeve = sleeve;
  if ((next.venue == null || next.venue === "") && venue) next.venue = venue;
  return next;
}

const FILL_TIME =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2}|Z)$/;

export function formatFillTime(iso: string): string {
  const match = FILL_TIME.exec(iso);
  if (!match) return iso;
  const offset = match[3] === "Z" ? "UTC" : match[3];
  return `${match[1]} ${match[2]}${offset === "UTC" ? " UTC" : offset}`;
}
