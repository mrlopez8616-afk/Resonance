/** Decimal-string math for sleeve prints. Avoids binary float drift. */

const DECIMAL = /^-?\d+(?:\.\d+)?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL.test(value.trim());
}

function scaleOf(value: string): number {
  const trimmed = value.trim();
  const dot = trimmed.indexOf(".");
  return dot === -1 ? 0 : trimmed.length - dot - 1;
}

const ZERO = BigInt(0);

function toUnits(value: string, places: number): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const abs = negative ? trimmed.slice(1) : trimmed;
  const [wholePart = "0", fracPart = ""] = abs.split(".");
  const padded = `${fracPart}${"0".repeat(places)}`.slice(0, places);
  const units = BigInt(`${wholePart || "0"}${padded}`);
  return negative ? -units : units;
}

function fromUnits(units: bigint, places: number): string {
  const negative = units < ZERO;
  const abs = negative ? -units : units;
  const raw = abs.toString().padStart(places + 1, "0");
  if (places === 0) return `${negative ? "-" : ""}${raw}`;
  const whole = raw.slice(0, -places);
  const frac = raw.slice(-places).replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : whole;
  return `${negative ? "-" : ""}${body}`;
}

export function addDecimal(left: string, right: string): string {
  const places = Math.max(scaleOf(left), scaleOf(right));
  return fromUnits(toUnits(left, places) + toUnits(right, places), places);
}

export function subtractDecimal(left: string, right: string): string {
  const places = Math.max(scaleOf(left), scaleOf(right));
  return fromUnits(toUnits(left, places) - toUnits(right, places), places);
}
