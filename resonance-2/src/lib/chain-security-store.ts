import "server-only";

import {
  chainSecurityHomeModel,
  presentFeed,
  presentIncident,
  type ChainSecurityFeed,
  type ChainSecurityHomeModel,
  type IncidentRecord,
  type IncidentView,
  type IncidentWrite,
  type ExposureId,
  type IncidentCategory,
  type LossKind,
  isExposureId,
  isIncidentId,
} from "@/lib/chain-security";
import { sqlQuery } from "@/lib/pg/client";

type IncidentRow = {
  id: string;
  occurred_on: string | Date | null;
  subject: string;
  category: string;
  cause: string;
  loss_kind: string;
  loss_low: string | number | null;
  loss_high: string | number | null;
  status: string;
  source_url: string | null;
  exposures: unknown;
};

const LIST_SQL = `SELECT id, occurred_on, subject, category, cause, loss_kind, loss_low, loss_high,
  status, source_url, exposures
  FROM chain_security_incidents`;

const UPSERT_SQL = `INSERT INTO chain_security_incidents (
  id, occurred_on, subject, category, cause, loss_kind, loss_low, loss_high, status, source_url, exposures, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
ON CONFLICT (id) DO UPDATE SET
  occurred_on = EXCLUDED.occurred_on,
  subject = EXCLUDED.subject,
  category = EXCLUDED.category,
  cause = EXCLUDED.cause,
  loss_kind = EXCLUDED.loss_kind,
  loss_low = EXCLUDED.loss_low,
  loss_high = EXCLUDED.loss_high,
  status = EXCLUDED.status,
  source_url = EXCLUDED.source_url,
  exposures = EXCLUDED.exposures,
  updated_at = now()`;

function asDay(value: string | Date | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${value.getUTCFullYear()}-${month}-${day}`;
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return match ? match[1] : null;
}

function asNumber(value: string | number | null): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function asCategory(value: string): IncidentCategory | null {
  if (value === "bridge_exploit" || value === "chain_bug" || value === "wallet_hardware" || value === "ai_quantum") {
    return value;
  }
  return null;
}

function asLossKind(value: string): LossKind | null {
  if (value === "amount" || value === "range" || value === "not_recorded" || value === "none") return value;
  return null;
}

function asExposures(value: unknown): ExposureId[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const exposures: ExposureId[] = [];
  for (const item of list) {
    if (typeof item === "string" && isExposureId(item) && !exposures.includes(item)) exposures.push(item);
  }
  return exposures;
}

function mapRow(row: IncidentRow): IncidentRecord | null {
  const category = asCategory(row.category);
  const kind = asLossKind(row.loss_kind);
  if (!category || !kind) return null;
  return {
    id: row.id,
    occurredOn: asDay(row.occurred_on),
    subject: row.subject,
    category,
    cause: row.cause,
    loss: { kind, low: asNumber(row.loss_low), high: asNumber(row.loss_high) },
    status: row.status,
    sourceUrl: row.source_url,
    exposures: asExposures(row.exposures),
  };
}

export async function readIncidents(): Promise<IncidentRecord[]> {
  const rows = await sqlQuery<IncidentRow>(LIST_SQL);
  return rows.flatMap((row) => {
    const incident = mapRow(row);
    return incident ? [incident] : [];
  });
}

export async function readIncident(id: string): Promise<IncidentRecord | null> {
  if (!isIncidentId(id)) return null;
  const rows = await sqlQuery<IncidentRow>(`${LIST_SQL} WHERE id = $1`, [id]);
  const row = rows[0];
  return row ? mapRow(row) : null;
}

export async function loadChainSecurityFeed(publicMode: boolean): Promise<ChainSecurityFeed> {
  return presentFeed(await readIncidents(), publicMode);
}

export async function loadChainSecurityIncident(
  id: string,
  publicMode: boolean,
): Promise<IncidentView | null> {
  const incident = await readIncident(id);
  return incident ? presentIncident(incident, publicMode) : null;
}

export async function loadChainSecurityHome(publicMode: boolean): Promise<ChainSecurityHomeModel> {
  return chainSecurityHomeModel(await readIncidents(), { publicMode });
}

export async function upsertIncident(
  incident: IncidentWrite,
): Promise<{ created: boolean; incident: IncidentRecord }> {
  const existing = await sqlQuery<{ id: string }>(
    `SELECT id FROM chain_security_incidents WHERE id = $1`,
    [incident.id],
  );
  await sqlQuery(UPSERT_SQL, [
    incident.id,
    incident.occurredOn,
    incident.subject,
    incident.category,
    incident.cause,
    incident.loss.kind,
    incident.loss.low,
    incident.loss.high,
    incident.status,
    incident.sourceUrl,
    JSON.stringify(incident.exposures),
  ]);
  const stored = await readIncident(incident.id);
  if (!stored) throw new Error("Chain Security write did not store a row.");
  return { created: existing.length === 0, incident: stored };
}
