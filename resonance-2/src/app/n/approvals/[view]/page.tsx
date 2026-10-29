import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalList } from "@/components/approvals-floor";
import { OperatorShell } from "@/components/operator-shell";
import { isPublicMode } from "@/lib/public-mode-server";
import { listApprovals } from "@/lib/approvals-store";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const label = view === "done" ? "Done" : "Pending";
  return { title: `${label} · Approvals · Resonance 2.0` };
}

export default async function ApprovalViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (view !== "pending" && view !== "done") notFound();

  const publicMode = await isPublicMode();
  let items: Awaited<ReturnType<typeof listApprovals>> | null = null;
  let unavailable = false;
  try {
    items = await listApprovals(view);
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/n/approvals" className="calendar-back">
        Approvals
      </Link>
      {items ? <ApprovalList items={items} mode={view} publicMode={publicMode} /> : null}
    </OperatorShell>
  );
}
