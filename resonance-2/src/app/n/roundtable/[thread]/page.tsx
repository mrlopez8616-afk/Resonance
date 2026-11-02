import { notFound } from "next/navigation";
import { RoundtableThread } from "@/components/roundtable-thread";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { isPublicMode } from "@/lib/public-mode-server";
import { isRoundtableId } from "@/lib/roundtable";
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
  const publicMode = await isPublicMode();

  const { thread: id } = await params;
  if (!isRoundtableId(id)) notFound();

  let view = null;
  let unavailable = false;
  try {
    view = await loadRoundtableThread(id, publicMode);
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }
  if (!unavailable && !view) notFound();

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <RoundtableThread view={view} reply={!publicMode} />
    </OperatorShell>
  );
}
