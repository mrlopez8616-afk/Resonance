import { notFound } from "next/navigation";
import { FightPromotion } from "@/components/fight-board";
import { blockedPublicPage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { fightPromotions, type FightPromotionId } from "@/lib/fight-desk";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";

export async function FightPromotionRoute({ promotionId }: { promotionId: FightPromotionId }) {
  const blocked = await blockedPublicPage();
  if (blocked) return blocked;
  const [book, card] = await Promise.all([loadBetsForPage(), loadCalendarForPage()]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const promotion = fightPromotions({ bets, events: card.events }).find((row) => row.id === promotionId);
  if (!promotion) notFound();
  const availability =
    book.status === "unavailable" ? "unavailable" : book.status === "unconfigured" ? "seed-only" : "live";
  const storageMessage = book.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null;
  const storageDetail = book.status === "unavailable" ? "Bet book is unavailable." : null;
  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={storageDetail}>
      <FightPromotion promotion={promotion} availability={availability} />
    </OperatorShell>
  );
}
