import { notFound } from "next/navigation";
import { FighterCareerView } from "@/components/fighter-career";
import { blockedPublicPage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { appendSettledResults, type CareerFight } from "@/lib/fighter-careers";
import { readFighterCareer } from "@/lib/fighter-careers-store";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadBreakdownsForPage, loadCalendarForPage, loadFightResultsForPage } from "@/lib/store-page";

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

function labelFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${labelFromSlug(slug)} · Resonance 2.0` };
}

export default async function FighterCareerPage({ params }: { params: Promise<{ slug: string }> }) {
  const blocked = await blockedPublicPage();
  if (blocked) return blocked;
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();

  let storageMessage: string | null = null;
  let name = labelFromSlug(slug);
  let fights: CareerFight[] = [];

  if (process.env.DATABASE_URL?.trim()) {
    try {
      const [loaded, resultsPage, calendar, breakdowns] = await Promise.all([
        readFighterCareer(slug),
        loadFightResultsForPage(),
        loadCalendarForPage(),
        loadBreakdownsForPage(),
      ]);
      if (loaded) {
        name = loaded.fighter.name;
        const results = resultsPage.status === "unavailable" ? [] : resultsPage.results;
        const rows = breakdowns.status === "unavailable" ? [] : breakdowns.breakdowns;
        fights = appendSettledResults(loaded.fights, {
          slug,
          results,
          events: calendar.events,
          boutDates: rows.flatMap((row) =>
            row.slot && /^\d{4}-\d{2}-\d{2}$/.test(row.slot)
              ? [{ event: row.eventSlug, fightSlug: row.fightSlug, date: row.slot }]
              : [],
          ),
        });
      }
      if (resultsPage.status === "unavailable" || breakdowns.status === "unavailable") {
        storageMessage = STORAGE_UNAVAILABLE_BANNER;
      }
    } catch (error) {
      if (!isStorageUnavailable(error)) throw error;
      storageMessage = STORAGE_UNAVAILABLE_BANNER;
    }
  }

  return (
    <OperatorShell storageMessage={storageMessage}>
      <FighterCareerView name={name} fights={fights} />
    </OperatorShell>
  );
}
