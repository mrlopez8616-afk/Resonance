import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
  if (parent.id === "fights") redirect("/fights");

  const floor = await loadOperatorFloor();
  const faceLines = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [
      ticker,
      typeof face.totalUsd === "number" && Number.isFinite(face.totalUsd)
        ? face.totalUsdLabel
        : null,
    ]),
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
        faceLines={faceLines}
      />
    </OperatorShell>
  );
}
