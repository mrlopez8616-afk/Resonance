import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { FitnessGrid } from "@/components/fitness-grid";
import { NodeGrid } from "@/components/node-grid";
import { OperatorShell } from "@/components/operator-shell";
import { PredictionsFloor } from "@/components/predictions-floor";
import { loadBankroll } from "@/lib/bankroll-load";
import { loadFitnessCards } from "@/lib/fitness-store";
import { loadOperatorFloor } from "@/lib/operator-floor";
import { legacyParentHref, parentById } from "@/lib/node-parents";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { valueCardFromFace } from "@/lib/value-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ parent: string }>;
}) {
  const { parent: id } = await params;
  const parent = parentById(id);
  return {
    title: parent ? `${parent.label} · Resonance 2.0` : "Floor · Resonance 2.0",
  };
}

export default async function ParentNodePage({
  params,
}: {
  params: Promise<{ parent: string }>;
}) {
  const { parent: id } = await params;
  const legacy = legacyParentHref(id);
  if (legacy) {
    if (id === "predictions") permanentRedirect(legacy);
    redirect(legacy);
  }
  const parent = parentById(id);
  if (!parent) notFound();

  if (parent.id === "fight-desk") {
    const [floor, bankroll] = await Promise.all([loadOperatorFloor(), loadBankroll()]);
    return (
      <OperatorShell
        storageMessage={
          floor.storageMessage ??
          (bankroll.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
        }
        storageDetail={floor.storageDetail ?? bankroll.storageDetail}
      >
        <PredictionsFloor ledger={bankroll.ledger} />
      </OperatorShell>
    );
  }

  if (parent.id === "fitness") {
    const [floor, fitness] = await Promise.all([loadOperatorFloor(), loadFitnessCards()]);
    return (
      <OperatorShell
        storageMessage={
          floor.storageMessage ??
          (fitness.availability === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
        }
        storageDetail={floor.storageDetail}
      >
        <Link href="/" className="calendar-back">
          Floor
        </Link>
        <FitnessGrid cards={fitness.cards} />
      </OperatorShell>
    );
  }

  const floor = await loadOperatorFloor();
  const cards = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [ticker, valueCardFromFace(face)]),
  );
  const heldUsd = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [ticker, face.totalUsd]),
  );
  return (
    <OperatorShell
      storageMessage={floor.storageMessage}
      storageDetail={floor.storageDetail}
    >
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      <NodeGrid
        parentId={parent.id}
        parentLabel={parent.label}
        cards={cards}
        heldUsd={heldUsd}
      />
    </OperatorShell>
  );
}
