import { ApprovalsParent } from "@/components/approvals-parent";
import { NodeHeader, NodeLayout, NodeSection, NodeSections } from "@/components/node-layout";
import { OperatorShell } from "@/components/operator-shell";
import { loadApprovalBoard } from "@/lib/approvals-store";
import { latestTimestamp } from "@/lib/node-layout";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Approvals · Resonance 2.0",
};

export default async function ApprovalsPage() {
  let board: Awaited<ReturnType<typeof loadApprovalBoard>> | null = null;
  let unavailable = false;
  try {
    board = await loadApprovalBoard();
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      {board ? (
        <ApprovalsParent
          pending={board.pending.length}
          done={board.done.length}
          updatedAt={latestTimestamp(
            [...board.pending, ...board.done].flatMap((item) => [item.createdAt, item.decidedAt]),
          )}
        />
      ) : (
        <NodeLayout>
          <NodeHeader name="Approvals" parts={["missing"]} backHref="/" />
          <NodeSections>
            <NodeSection kind="lists" empty />
          </NodeSections>
        </NodeLayout>
      )}
    </OperatorShell>
  );
}
