import type { NodeLink, Provenance } from "./types";

export function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function xrpUsdRate(
  liveUsd: number | null | undefined,
  manualUsd: number | null,
): { usd: number; provenance: Provenance; label: string } | null {
  if (typeof liveUsd === "number" && Number.isFinite(liveUsd) && liveUsd > 0) {
    return { usd: liveUsd, provenance: "verified", label: "live feed" };
  }
  if (typeof manualUsd === "number" && Number.isFinite(manualUsd) && manualUsd > 0) {
    return {
      usd: manualUsd,
      provenance: "founder-reported",
      label: "manual XRP/USD",
    };
  }
  return null;
}

export function mergeLinks(raw: unknown, fallback: NodeLink[]): NodeLink[] {
  if (!Array.isArray(raw)) return fallback;
  const links: NodeLink[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const kind =
      record.kind === "funds" ||
      record.kind === "depends-on" ||
      record.kind === "related"
        ? record.kind
        : "related";
    const targetTicker =
      typeof record.targetTicker === "string" ? record.targetTicker : "";
    if (!targetTicker) continue;
    links.push({
      targetTicker,
      kind,
      note: typeof record.note === "string" ? record.note : "",
    });
  }
  return links;
}
