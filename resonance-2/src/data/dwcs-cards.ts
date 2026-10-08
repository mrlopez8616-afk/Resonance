import { sortCardFights, type BoutSegment, type DeskFight } from "@/lib/fight-desk";

export type StaticBout = {
  /** 1 is the first fight of the night. */
  boutOrder: number;
  slug: string;
  title: string;
  division: string;
  segment: BoutSegment | null;
};

export type StaticFightCard = {
  slug: string;
  title: string;
  meta: string;
  /**
   * Where the running order came from.
   * DWCS week 9 has no order field in the bet book, so this list is the card.
   */
  orderSource: string;
  fights: readonly StaticBout[];
};

/**
 * Dana White's Contender Series Season 10, Week 9.
 * UFC.com's episode fight-card list, first bout through the main event.
 * The show is one card (no early prelims / prelims split).
 */
export const DWCS_S10_WEEK_9: StaticFightCard = {
  slug: "dwcs-s10-week-9",
  title: "Dana White's Contender Series S10 Week 9",
  meta: "UFC APEX, Las Vegas · Tue 6 Oct",
  orderSource: "UFC.com DWCS Season 10 Episode 9 fight-card list (opener first)",
  fights: [
    {
      boutOrder: 1,
      slug: "preston-lagrange-vs-nell-ariano",
      title: "Preston LaGrange vs Nell Ariano",
      division: "Light Heavyweight",
      segment: null,
    },
    {
      boutOrder: 2,
      slug: "ryuho-miyaguchi-vs-mateus-soares",
      title: "Ryuho Miyaguchi vs Mateus Soares",
      division: "Bantamweight",
      segment: null,
    },
    {
      boutOrder: 3,
      slug: "roque-conceicao-vs-alexander-chavez",
      title: "Roque Conceição vs Alexander Chávez",
      division: "Flyweight",
      segment: null,
    },
    {
      boutOrder: 4,
      slug: "salhahuddin-everett-vs-ozzy-martin",
      title: "Salhahuddin Everett vs Ozzy Martin",
      division: "Welterweight",
      segment: null,
    },
    {
      boutOrder: 5,
      slug: "summer-onley-vs-alivia-bierley",
      title: "Summer Onley vs Alivia Bierley",
      division: "Women's Bantamweight",
      segment: null,
    },
  ],
};

const STATIC_CARDS = [DWCS_S10_WEEK_9];

export function staticFightCard(eventSlug: string): StaticFightCard | null {
  const id = eventSlug.trim().toLowerCase();
  return STATIC_CARDS.find((card) => card.slug === id) ?? null;
}

/**
 * Official card order fills bouts the bet book does not already number.
 * A posted boutOrder wins. Fights that are on neither list stay last.
 */
export function applyStaticCard(eventSlug: string, fights: readonly DeskFight[]): DeskFight[] {
  const card = staticFightCard(eventSlug);
  if (!card) return sortCardFights(fights);
  const bySlug = new Map(fights.map((fight) => [fight.slug, fight]));
  const seen = new Set<string>();
  const merged: DeskFight[] = [];
  for (const row of card.fights) {
    seen.add(row.slug);
    const existing = bySlug.get(row.slug);
    if (!existing) {
      merged.push({
        slug: row.slug,
        title: row.title,
        kicker: "",
        detail: row.division,
        segment: row.segment,
        boutOrder: row.boutOrder,
        bets: [],
      });
      continue;
    }
    merged.push({
      ...existing,
      title: existing.title || row.title,
      detail: existing.detail || row.division,
      segment: existing.segment ?? row.segment,
      boutOrder: existing.boutOrder ?? row.boutOrder,
    });
  }
  for (const fight of fights) {
    if (!seen.has(fight.slug)) merged.push(fight);
  }
  return sortCardFights(merged);
}
