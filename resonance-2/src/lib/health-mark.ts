import "server-only";

import { sqlQuery } from "@/lib/pg/client";

export async function rememberHealthMark(ok: boolean, checkedAt: string): Promise<void> {
  if (!Number.isFinite(Date.parse(checkedAt))) return;
  await sqlQuery(
    `INSERT INTO health_check_marks (id, ok, checked_at)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET ok = EXCLUDED.ok, checked_at = EXCLUDED.checked_at`,
    [ok, checkedAt],
  );
}

export async function readHealthMark(): Promise<{ ok: boolean; checkedAt: string } | null> {
  const rows = await sqlQuery<{ ok: boolean | string; checked_at: Date | string }>(
    `SELECT ok, checked_at FROM health_check_marks WHERE id = 1`,
  );
  const row = rows[0];
  if (!row) return null;
  const checkedAt = row.checked_at instanceof Date ? row.checked_at.toISOString() : String(row.checked_at);
  const ok = row.ok === true || row.ok === "t" || row.ok === "true";
  return { ok, checkedAt };
}
