/** Short reject labels from the ingest log. Anything else is dropped so a token cannot be shown. */
const REJECT_REASONS = new Set([
  "missing header",
  "bad token",
  "no token configured",
  "bad body",
  "body too large",
  "storage unavailable",
  "token lookup failed",
  "write failed",
]);

const CHICAGO: Intl.DateTimeFormatOptions = {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export function formatChicagoWhen(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-US", CHICAGO).format(date).replace(/\u202f/g, " ");
}

/**
 * One status line for the Health Auto Export ingest route.
 * Times are America/Chicago. The reason is a short label. Token values are not included.
 */
export function formatHealthAutoExportStatus(input: {
  lastSuccessAt: string | null;
  lastRejectAt: string | null;
  lastRejectReason: string | null;
}): string {
  const accepted = formatChicagoWhen(input.lastSuccessAt);
  const rejectedWhen = formatChicagoWhen(input.lastRejectAt);
  const reason = input.lastRejectReason?.trim() ?? "";
  const safeReason = REJECT_REASONS.has(reason) ? reason : "";
  const rejected = safeReason ? `${rejectedWhen} (${safeReason})` : rejectedWhen;
  return `Last accepted post ${accepted}. Last rejected ${rejected}.`;
}
