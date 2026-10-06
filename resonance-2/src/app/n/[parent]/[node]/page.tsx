import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveNodeFace } from "@/components/live-node-face";
import { NodeSquare } from "@/components/node-square";
import { OperatorShell } from "@/components/operator-shell";
import { FLOOR_NODES } from "@/data/floor-nodes";
import type { NodeSleeve } from "@/data/sleeves";
import { fillDeskHref } from "@/lib/fill-desk";
import { nodeParent, parentById } from "@/lib/node-parents";
import { loadOperatorFloor, type OperatorFloor } from "@/lib/operator-floor";

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
  const parent = parentById(parentId);
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
          label={ready ? `${node.ticker} live node` : `${node.ticker} offline`}
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
            <>
              <h2 className="node-ticker">{node.ticker}</h2>
              <p className="node-note">offline</p>
            </>
          )}
        </NodeSquare>
      </section>
    </OperatorShell>
  );
}
