/** Private label for a SUI quantity that did not come from a fresh Coinbase read. */

export type SuiBalanceMark = {
  /** True only for a portfolio read that just succeeded. */
  fresh: boolean;
  /** When the quantity was last read. Null when the only source is a sleeve print. */
  asOf: string | null;
};

export function formatBalanceAsOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * A fresh read has no extra line. A stored or printed quantity says stale,
 * and names the read time when one was stored. No clock is invented.
 */
export function suiBalanceLine(mark: SuiBalanceMark): string | null {
  if (mark.fresh) return null;
  if (!mark.asOf) return "stale";
  const when = formatBalanceAsOf(mark.asOf);
  return when ? `stale · as of ${when}` : "stale";
}
