import { notFound } from "next/navigation";
import { FightDetail } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { resultForFight } from "@/lib/fight-results";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadBetsForPage, loadFightResultsForPage } from "@/lib/store-page";
import { fightBySlug, UFC_332_EVENT } from "@/lib/ufc332";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ event: string; fight: string }>;
}) {
  const { event, fight: slug } = await params;
  const fight = event === UFC_332_EVENT.id ? fightBySlug(slug) : null;
  const title = fight ? `${fight.A.name} vs ${fight.B.name}` : "Fight";
  return { title: `${title} · Resonance 2.0` };
}

function oneQuery(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.[0] ?? null;
}

export default async function FightPage({
  params,
  searchParams,
}: {
  params: Promise<{ event: string; fight: string }>;
  searchParams: Promise<{ node?: string | string[] }>;
}) {
  const { event, fight: slug } = await params;
  const requestedNode = oneQuery((await searchParams).node);
  const node =
    requestedNode === "main-card" || requestedNode === "prelims"
      ? requestedNode
      : fightBySlug(slug)?.segment === "main-card"
        ? "main-card"
        : "prelims";
  if (event !== UFC_332_EVENT.id) notFound();
  const fight = fightBySlug(slug);
  if (!fight) notFound();
  const [book, card] = await Promise.all([loadBetsForPage(), loadFightResultsForPage()]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const results = card.status === "unavailable" ? [] : card.results;
  const availability =
    book.status === "unavailable" ? "unavailable" : book.status === "unconfigured" ? "seed-only" : "live";
  const resultsAvailability =
    card.status === "unavailable" ? "unavailable" : card.status === "unconfigured" ? "seed-only" : "live";
  const storageMessage =
    book.status === "unavailable" || card.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null;
  const storageDetail = [
    book.status === "unavailable" ? "Bet book is unavailable." : null,
    card.status === "unavailable" ? "Fight results are unavailable." : null,
  ]
    .filter((line): line is string => line !== null)
    .join(" ");

  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={storageDetail || null}>
      <FightDetail
        fight={fight}
        bets={bets}
        result={resultForFight(results, fight.slug)}
        backHref={`/fights/${UFC_332_EVENT.id}?node=${node}`}
        availability={availability}
        resultsAvailability={resultsAvailability}
      />
    </OperatorShell>
  );
}
