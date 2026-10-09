import Link from "next/link";
import { ApprovalsParent } from "@/components/approvals-parent";
import { blockedPublicPage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { loadApprovalBoard } from "@/lib/approvals-store";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Approvals · Resonance 2.0",
};

export default async function ApprovalsPage() {
  const blocked = await blockedPublicPage();
  if (blocked) return blocked;

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
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      {board ? <ApprovalsParent pending={board.pending.length} done={board.done.length} /> : null}
    </OperatorShell>
  );
}
