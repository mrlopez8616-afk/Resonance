import Link from "next/link";
import { notFound } from "next/navigation";
import { RoundtableThread } from "@/components/roundtable-thread";
import { blockedPublicPage } from "@/components/private-notice";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { isPublicMode } from "@/lib/public-mode-server";
import { isRoundtableId, ROUNDTABLE_HREF } from "@/lib/roundtable";
import { loadRoundtableThread } from "@/lib/roundtable-store";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Thread · Roundtable · Resonance 2.0",
};

export default async function RoundtableThreadPage({
  params,
}: {
  params: Promise<{ thread: string }>;
}) {
  await requireRole("owner");
  const blocked = await blockedPublicPage();
  if (blocked) return blocked;

  const { thread: id } = await params;
  if (!isRoundtableId(id)) notFound();

  let view = null;
  let unavailable = false;
  try {
    view = await loadRoundtableThread(id, await isPublicMode());
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }
  if (!unavailable && !view) notFound();

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href={ROUNDTABLE_HREF} className="calendar-back">
        Roundtable
      </Link>
      {view ? <RoundtableThread view={view} /> : null}
    </OperatorShell>
  );
}
