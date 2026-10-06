import { notFound } from "next/navigation";
import { FightNode } from "@/components/fight-board";
import { OperatorShell } from "@/components/operator-shell";
import { fightDeskNodes, type FightDeskNodeId } from "@/lib/fight-desk";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";

export async function FightNodeRoute({ nodeId }: { nodeId: FightDeskNodeId }) {
  const [book, card] = await Promise.all([loadBetsForPage(), loadCalendarForPage()]);
  const bets = book.status === "unavailable" ? [] : book.bets;
  const node = fightDeskNodes({ bets, events: card.events }).find((row) => row.id === nodeId);
  if (!node) notFound();
  const storageMessage = book.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null;
  const storageDetail = book.status === "unavailable" ? "Bet book is unavailable." : null;
  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={storageDetail}>
      <FightNode node={node} />
    </OperatorShell>
  );
}
