import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NodeGrid } from "@/components/node-grid";
import { OperatorShell } from "@/components/operator-shell";
import { loadOperatorFloor } from "@/lib/operator-floor";
import { legacyParentHref, parentById } from "@/lib/node-parents";
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
  if (legacy) redirect(legacy);
  const parent = parentById(id);
  if (!parent) notFound();
  if (parent.id === "fights") redirect("/fights");

  const floor = await loadOperatorFloor();
  const cards = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [ticker, valueCardFromFace(face)]),
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
      />
    </OperatorShell>
  );
}
