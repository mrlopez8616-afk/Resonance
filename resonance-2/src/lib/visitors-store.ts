import "server-only";

import { sqlQuery } from "@/lib/pg/client";
import { isStorageUnavailable } from "@/lib/storage-unavailable";
import { utcDay } from "@/lib/visitors";

export type VisitorDay = {
  day: string;
  visitors: number;
  views: number;
};

export type VisitorSummary = {
  todayVisitors: number;
  todayViews: number;
  totalVisitors: number;
  totalViews: number;
  days: VisitorDay[];
};

const EMPTY: VisitorSummary = {
  todayVisitors: 0,
  todayViews: 0,
  totalVisitors: 0,
  totalViews: 0,
  days: [],
};

function dayKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return text.slice(0, 10);
}

/** Counts only. No address, agent, or hash leaves this function. */
export async function readVisitorSummary(now = new Date()): Promise<VisitorSummary> {
  try {
    const rows = await sqlQuery<{ day: string | Date; page_views: number; unique_visitors: number }>(
      `SELECT day, page_views, unique_visitors
       FROM visitor_days
       ORDER BY day`,
    );
    const today = utcDay(now);
    let totalVisitors = 0;
    let totalViews = 0;
    let todayVisitors = 0;
    let todayViews = 0;
    const byDay = new Map<string, VisitorDay>();
    for (const row of rows) {
      const day = dayKey(row.day);
      const visitors = Number(row.unique_visitors) || 0;
      const views = Number(row.page_views) || 0;
      totalVisitors += visitors;
      totalViews += views;
      if (day === today) {
        todayVisitors = visitors;
        todayViews = views;
      }
      byDay.set(day, { day, visitors, views });
    }
    const days: VisitorDay[] = [];
    const start = Date.parse(`${today}T00:00:00.000Z`);
    for (let offset = 13; offset >= 0; offset -= 1) {
      const day = new Date(start - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      days.push(byDay.get(day) ?? { day, visitors: 0, views: 0 });
    }
    return { todayVisitors, todayViews, totalVisitors, totalViews, days };
  } catch (error) {
    if (isStorageUnavailable(error)) return EMPTY;
    throw error;
  }
}

/**
 * One page view. The hash is the only identity stored.
 * A new hash for the day adds one unique. The statement touches only these two tables.
 */
export async function recordVisitorHit(day: string, hash: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return;
  const inserted = await sqlQuery<{ visitor_hash: string }>(
    `INSERT INTO visitor_seen (day, visitor_hash)
     VALUES ($1::date, $2)
     ON CONFLICT (day, visitor_hash) DO NOTHING
     RETURNING visitor_hash`,
    [day, hash],
  );
  const unique = inserted.length > 0 ? 1 : 0;
  await sqlQuery(
    `INSERT INTO visitor_days (day, page_views, unique_visitors)
     VALUES ($1::date, 1, $2)
     ON CONFLICT (day) DO UPDATE
     SET page_views = visitor_days.page_views + 1,
         unique_visitors = visitor_days.unique_visitors + $2`,
    [day, unique],
  );
}
