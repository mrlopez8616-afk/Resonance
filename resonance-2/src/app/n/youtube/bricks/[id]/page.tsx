import Link from "next/link";
import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { YouTubeBrickDetail } from "@/components/youtube-bricks";
import { requireRole } from "@/lib/auth-session";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { isBrickId } from "@/lib/youtube-bricks";
import { loadBrick } from "@/lib/youtube-bricks-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Brick · Brick Tracker · Resonance 2.0",
};

export default async function YouTubeBrickPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("owner");
  const { id } = await params;
  if (!isBrickId(id)) notFound();
  let row = null;
  let unavailable = false;
  try {
    row = await loadBrick(id, await isPublicMode());
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }
  if (!unavailable && !row) notFound();
  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/n/youtube/bricks" className="calendar-back">
        Brick Tracker
      </Link>
      {row ? <YouTubeBrickDetail row={row} /> : null}
    </OperatorShell>
  );
}
