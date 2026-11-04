import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** One supplies payload is small. Reject anything larger before parse. */
export const PRINTER_BODY_LIMIT = 128_000;

/** No reading in this window marks the node stale. */
export const PRINTER_STALE_MS = 24 * 60 * 60 * 1000;

export const PRINTER_HEADER = "x-printer-token";
export const PRINTER_HEADER_NAME = "X-Printer-Token";
export const PRINTER_URL = "https://resonance3.vercel.app/api/ingest/printer";
export const PRINTER_MODEL = "HP OfficeJet Pro 9120e";

const SUPPLY_LIMIT = 24;

export type InkColor = "C" | "M" | "Y" | "K";
export type InkState = "ok" | "low" | "depleted";
export type SupplyType = "inkCartridge" | "printHead";
export type SupplyColor = InkColor | "CMYK";

export type PrinterSupply = {
  supplyType: SupplyType;
  color: SupplyColor;
  percent: number | null;
  state: InkState | null;
  buy: string | null;
  pagesRemaining: number | null;
};

export type PrinterSnapshot = {
  printerModel: string | null;
  readAt: string | null;
  version: string | null;
  supplies: PrinterSupply[];
};

/** One stored reading, ready for the node page. */
export type PrinterLatest = {
  id: string;
  printerModel: string | null;
  readAt: string | null;
  receivedAt: string;
  shownAt: string;
  version: string | null;
  supplies: PrinterSupply[];
};

export type PrinterGauge = {
  color: InkColor;
  label: string;
  percent: number | null;
  state: InkState | null;
  buy: string | null;
};

export const INK_GAUGES: readonly { color: InkColor; label: string }[] = [
  { color: "C", label: "Cyan" },
  { color: "M", label: "Magenta" },
  { color: "Y", label: "Yellow" },
  { color: "K", label: "Black" },
];

export function newPrinterToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPrinterToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Compare a presented token with the stored sha256 hex digest. */
export function printerTokenMatches(provided: string, storedHex: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = /^[0-9a-f]{64}$/i.test(storedHex) ? Buffer.from(storedHex, "hex") : Buffer.alloc(0);
  if (right.length !== left.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function formatInkPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}%`;
}

/** The clock the page and the stale flag share. A missing read time uses receipt time. */
export function printerReadingAt(readAt: string | null, receivedAt: string): string {
  if (readAt && Number.isFinite(Date.parse(readAt))) return readAt;
  return receivedAt;
}

export function printerFeedStale(at: string, now: number): boolean {
  const stamp = Date.parse(at);
  if (!Number.isFinite(stamp)) return true;
  return now - stamp > PRINTER_STALE_MS;
}

export function inkGauges(supplies: readonly PrinterSupply[]): PrinterGauge[] {
  return INK_GAUGES.map((gauge) => {
    const supply = supplies.find((row) => row.supplyType === "inkCartridge" && row.color === gauge.color);
    return {
      color: gauge.color,
      label: gauge.label,
      percent: supply?.percent ?? null,
      state: supply?.state ?? null,
      buy: supply?.buy ?? null,
    };
  });
}

/** Drop token fields before the raw body is stored. */
export function printerPayloadForStore(body: unknown): unknown {
  const record = asRecord(body);
  if (!record) return body;
  const copy: Record<string, unknown> = { ...record };
  for (const key of Object.keys(copy)) {
    if (/token/i.test(key)) delete copy[key];
  }
  return copy;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function shortText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

function percentValue(value: unknown): number | null {
  let parsed: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) parsed = value;
  else if (typeof value === "string" && value.trim()) {
    const match = /^(-?\d+(?:\.\d+)?)\s*%?$/.exec(value.trim());
    if (!match?.[1]) return null;
    const number = Number(match[1]);
    parsed = Number.isFinite(number) ? number : null;
  }
  if (parsed === null) return null;
  return Math.min(100, Math.max(0, parsed));
}

function pagesRemaining(value: unknown): number | null {
  let parsed: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) parsed = value;
  else if (typeof value === "string" && value.trim()) {
    const match = /^(\d+(?:\.\d+)?)$/.exec(value.trim().replace(/,/g, ""));
    if (!match?.[1]) return null;
    parsed = Number(match[1]);
  }
  if (parsed === null || !Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) return null;
  return Math.round(parsed);
}

function namedState(value: unknown): InkState | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (text === "ok" || text === "good") return "ok";
  if (text === "low" || text === "verylow" || text === "warning") return "low";
  if (text === "empty" || text === "depleted" || text === "out" || text === "exhausted") return "depleted";
  return null;
}

function inkState(levelState: unknown, supplyState: unknown, percent: number | null): InkState | null {
  if (percent === 0) return "depleted";
  const named = namedState(levelState) ?? namedState(supplyState);
  if (named) return named;
  if (percent === null) return null;
  if (percent <= 10) return "low";
  return "ok";
}

function buyLabel(record: Record<string, unknown>): string | null {
  const parts = Array.isArray(record.supportedParts) ? record.supportedParts : [];
  let fromPart: unknown = null;
  for (const part of parts) {
    const row = asRecord(part);
    if (!row) continue;
    if (row.selectabilityNumber != null && String(row.selectabilityNumber).trim()) {
      fromPart = row.selectabilityNumber;
      break;
    }
  }
  return formatPart(fromPart ?? record.selectabilityNumber);
}

function formatPart(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text || text.length > 40) return null;
  if (/^hp\b/i.test(text)) return text.replace(/^hp\b/i, "HP");
  return `HP ${text}`;
}

function supplyType(value: unknown): SupplyType | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text === "inkCartridge" || text === "printHead") return text;
  return null;
}

function supplyColor(value: unknown): SupplyColor | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toUpperCase();
  if (text === "C" || text === "M" || text === "Y" || text === "K" || text === "CMYK") return text;
  return null;
}

function readAtValue(value: unknown): string | null {
  const text = shortText(value, 80);
  if (!text || !Number.isFinite(Date.parse(text))) return null;
  return new Date(text).toISOString();
}

/** Null when the body has no ink cartridge. */
export function parsePrinterSnapshot(body: unknown): PrinterSnapshot | null {
  const record = asRecord(body);
  if (!record || !Array.isArray(record.suppliesList)) return null;
  const supplies: PrinterSupply[] = [];
  const seenInk = new Set<InkColor>();
  for (const item of record.suppliesList) {
    if (supplies.length >= SUPPLY_LIMIT) break;
    const row = asRecord(item);
    if (!row) continue;
    const type = supplyType(row.supplyType);
    const color = supplyColor(row.supplyColorCode);
    if (!type || !color) continue;
    if (type === "inkCartridge" && color !== "CMYK") {
      if (seenInk.has(color)) continue;
      seenInk.add(color);
    }
    const percent = percentValue(row.percentLifeDisplay);
    supplies.push({
      supplyType: type,
      color,
      percent,
      state: type === "inkCartridge" && color !== "CMYK" ? inkState(row.levelState, row.supplyState, percent) : namedState(row.levelState),
      buy: buyLabel(row),
      pagesRemaining: pagesRemaining(row.approximatePagesRemainingDisplay),
    });
  }
  const ink = supplies.some((row) => row.supplyType === "inkCartridge" && row.color !== "CMYK");
  if (!ink) return null;
  return {
    printerModel: shortText(record.printerModel, 80),
    readAt: readAtValue(record.readAt),
    version: shortText(record.version, 40),
    supplies,
  };
}
