import Link from "next/link";
import { notFound } from "next/navigation";
import { NodeGrid } from "@/components/node-grid";
import { OperatorShell } from "@/components/operator-shell";
import { loadOperatorFloor } from "@/lib/operator-floor";
import { parentById } from "@/lib/node-parents";

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
  const parent = parentById(id);
  if (!parent) notFound();

  const floor = await loadOperatorFloor();
  return (
    <OperatorShell
      storageMessage={floor.storageMessage}
      storageDetail={floor.storageDetail}
    >
      <Link href="/" className="parent-back">
        Floor
      </Link>
      <NodeGrid
        parentId={parent.id}
        parentLabel={parent.label}
        faces={floor.faces}
        sleeves={floor.sleeves}
        fightDesk={floor.fightDesk}
        fightDeskAvailability={floor.fightDeskAvailability}
      />
    </OperatorShell>
  );
}
