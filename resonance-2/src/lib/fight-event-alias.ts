/**
 * Oct 17 2026 UFC Fight Night was filed twice: Buckley vs Malott, and Edmonton.
 * Edmonton is the venue. The headliner card is the canonical event.
 * Stored rows stay. Reads use the canonical slug.
 */

export const BUCKLEY_EVENT_SLUG = "ufc-fight-night-buckley-vs-malott";
export const BUCKLEY_EVENT_TITLE = "UFC Fight Night: Buckley vs Malott";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Titles and slugs that name the Edmonton copy of the Buckley card. */
export function isEdmontonAlias(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (!text || text === BUCKLEY_EVENT_SLUG || text === BUCKLEY_EVENT_TITLE.toLowerCase()) return false;
  if (text.includes("buckley") || text.includes("malott")) return false;
  if (!text.includes("edmonton")) return false;
  if (text.includes(" vs")) return false;
  return text.includes("ufc") || text === "edmonton";
}

/** Buckley slug for an Edmonton alias. Any other slug or title is unchanged. */
export function canonicalEventSlug(value: string): string {
  const text = value.trim();
  if (!text) return "";
  if (isEdmontonAlias(text)) return BUCKLEY_EVENT_SLUG;
  const lower = text.toLowerCase();
  if (SLUG.test(lower) && !/\s/.test(text)) return lower;
  return lower;
}

export function canonicalEventTitle(value: string): string {
  return isEdmontonAlias(value) ? BUCKLEY_EVENT_TITLE : value.trim();
}

const CARD_NOISE = new Set([
  "fight",
  "night",
  "early",
  "prelims",
  "prelim",
  "main",
  "card",
  "event",
  "ufc",
  "place",
]);

/** Words that can identify a card. Session and promotion words are left out. */
export function cardTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5 && !CARD_NOISE.has(word));
}

/** Names from an "A vs B" title. A title with no bout is empty. */
export function headlinerTokens(title: string): string[] {
  if (!/\svs\.?\s/i.test(title)) return [];
  return cardTokens(title);
}

export function sharesCardToken(left: readonly string[], right: readonly string[]): boolean {
  return left.some((token) => right.includes(token));
}

/**
 * Same card when the headliners overlap.
 * When one title names no bout, a shared venue word is enough.
 * Two different bouts do not match.
 */
export function sameHeadlinerOrVenue(
  left: { title: string; place?: string },
  right: { title: string; place?: string },
): boolean {
  const leftHeads = headlinerTokens(left.title);
  const rightHeads = headlinerTokens(right.title);
  if (leftHeads.length > 0 && rightHeads.length > 0) return sharesCardToken(leftHeads, rightHeads);
  return sharesCardToken(
    cardTokens(`${left.title} ${left.place ?? ""}`),
    cardTokens(`${right.title} ${right.place ?? ""}`),
  );
}
