import Link from "next/link";
import { IdeasBoard } from "@/components/ideas-board";
import { IdeaActions, IdeaCreate } from "@/components/ideas-editor";
import { OperatorShell } from "@/components/operator-shell";
import { getSession } from "@/lib/auth-session";
import { chicagoToday } from "@/lib/calendar-time";
import { parseIdeaStatusFilter } from "@/lib/future-ideas";
import { loadIdeaBoard } from "@/lib/future-ideas-store";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Future Ideas · Resonance 2.0",
};

export default async function FutureIdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; show?: string | string[] }>;
}) {
  const query = await searchParams;
  const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const rawShow = Array.isArray(query.show) ? query.show[0] : query.show;
  const publicMode = await isPublicMode();
  const session = await getSession();
  const canEdit = session?.role === "owner" && !publicMode;
  const archivedView = canEdit && rawShow === "archived";
  const filter = archivedView ? "all" : parseIdeaStatusFilter(rawStatus);
  let cards = null;
  let unavailable = false;
  try {
    cards = await loadIdeaBoard(publicMode, archivedView);
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/n/build" className="calendar-back">
        Build
      </Link>
      {cards ? (
        <IdeasBoard
          cards={cards}
          filter={filter}
          archivedView={archivedView}
          actions={canEdit ? (card) => <IdeaActions card={card} /> : undefined}
          footer={canEdit && !archivedView ? <IdeaCreate today={chicagoToday()} /> : null}
        />
      ) : null}
    </OperatorShell>
  );
}
