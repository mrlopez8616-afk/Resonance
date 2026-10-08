import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { FitnessDetail } from "@/components/fitness-detail";
import { LiveNodeFace } from "@/components/live-node-face";
import { NodeSquare } from "@/components/node-square";
import { BankrollLedgerView } from "@/components/predictions-floor";
import { ValueCard } from "@/components/value-card";
import { OperatorShell } from "@/components/operator-shell";
import { loadBankroll } from "@/lib/bankroll-load";
import { FLOOR_NODES } from "@/data/floor-nodes";
import type { NodeSleeve } from "@/data/sleeves";
import { fillDeskHref } from "@/lib/fill-desk";
import { FITNESS_NODES } from "@/lib/fitness-board";
import { loadFitnessNode } from "@/lib/fitness-store";
import { legacyParentHref, nodeParent, parentById } from "@/lib/node-parents";
import { loadOperatorFloor, type OperatorFloor } from "@/lib/operator-floor";
import { STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function sleevesFor(floor: OperatorFloor, ticker: string): readonly NodeSleeve[] | undefined {
  const books: Record<string, readonly NodeSleeve[] | undefined> = floor.sleeves;
  return books[ticker];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ parent: string; node: string }>;
}) {
  const { parent: parentId, node: nodeId } = await params;
  const parent = parentById(parentId);
  if (parent?.id === "fitness") {
    const node = FITNESS_NODES.find((item) => item.id === nodeId);
    const title = node ? `${node.title} · ${parent.label}` : "Node";
    return { title: `${title} · Resonance 2.0` };
  }
  if (parent?.id === "fight-desk" && nodeId === "bankroll") {
    return { title: `Bankroll · ${parent.label} · Resonance 2.0` };
  }
  const node = FLOOR_NODES.find((item) => item.id === nodeId);
  const title = node && parent ? `${node.ticker} · ${parent.label}` : "Node";
  return { title: `${title} · Resonance 2.0` };
}

export default async function NodeDetailPage({
  params,
}: {
  params: Promise<{ parent: string; node: string }>;
}) {
  const { parent: parentId, node: nodeId } = await params;
  const legacy = legacyParentHref(parentId, nodeId);
  if (legacy) {
    if (parentId === "predictions") permanentRedirect(legacy);
    redirect(legacy);
  }
  const parent = parentById(parentId);
  if (parent?.id === "fitness") {
    const [floor, fitness] = await Promise.all([
      loadOperatorFloor(),
      loadFitnessNode(nodeId),
    ]);
    if (!fitness.detail) notFound();
    return (
      <OperatorShell
        storageMessage={
          floor.storageMessage ??
          (fitness.availability === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
        }
        storageDetail={floor.storageDetail}
      >
        <Link href={`/n/${parent.id}`} className="calendar-back">
          {parent.label}
        </Link>
        <FitnessDetail detail={fitness.detail} />
      </OperatorShell>
    );
  }
  if (parent?.id === "fight-desk") {
    if (nodeId !== "bankroll") notFound();
    const [floor, bankroll] = await Promise.all([loadOperatorFloor(), loadBankroll()]);
    return (
      <OperatorShell
        storageMessage={
          floor.storageMessage ??
          (bankroll.status === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null)
        }
        storageDetail={floor.storageDetail ?? bankroll.storageDetail}
      >
        <Link href={`/n/${parent.id}`} className="calendar-back">
          {parent.label}
        </Link>
        {bankroll.ledger ? (
          <BankrollLedgerView ledger={bankroll.ledger} />
        ) : (
          <p className="parent-empty" role="status">
            unavailable
          </p>
        )}
      </OperatorShell>
    );
  }

  const node = FLOOR_NODES.find((item) => item.id === nodeId && item.status !== "empty");
  if (!parent || !node || nodeParent(node.id) !== parent.id) notFound();

  const floor = await loadOperatorFloor();
  const sleeves = sleevesFor(floor, node.ticker);
  const face = floor.faces[node.ticker];
  const ready = Boolean(face && sleeves);

  return (
    <OperatorShell
      storageMessage={floor.storageMessage}
      storageDetail={floor.storageDetail}
    >
      <Link href={`/n/${parent.id}`} className="calendar-back">
        {parent.label}
      </Link>
      <section className="node-grid" aria-label={`${node.ticker} node`}>
        <NodeSquare
          live={ready}
          dashed={!ready}
          label={ready ? `${node.ticker} live node` : `${node.ticker} not connected`}
        >
          {ready && face && sleeves ? (
            <Link
              href={fillDeskHref({ ticker: node.ticker })}
              className="node-log-link"
              title={`Open ${node.ticker} log`}
            >
              <span className="sr-only">Open {node.ticker} operator log</span>
              <LiveNodeFace ticker={node.ticker} sleeves={sleeves} initial={face} />
            </Link>
          ) : (
            <ValueCard
              ticker={node.ticker}
              model={{ headline: null, priceLine: null, label: "not connected" }}
            />
          )}
        </NodeSquare>
      </section>
    </OperatorShell>
  );
}
