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

const FILL_TIME =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2}|Z)$/;

export function formatFillTime(iso: string): string {
  const match = FILL_TIME.exec(iso);
  if (!match) return iso;
  const offset = match[3] === "Z" ? "UTC" : match[3];
  return `${match[1]} ${match[2]}${offset === "UTC" ? " UTC" : offset}`;
}
