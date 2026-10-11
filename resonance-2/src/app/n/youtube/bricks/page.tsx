import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { YouTubeBrickList } from "@/components/youtube-bricks";
import { requireRole } from "@/lib/auth-session";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { parseBrickStatusFilter } from "@/lib/youtube-bricks";
import { loadBrickRows } from "@/lib/youtube-bricks-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Brick Tracker · YouTube · Resonance 2.0",
};

export default async function YouTubeBricksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requireRole("owner");
  const query = await searchParams;
  const raw = Array.isArray(query.status) ? query.status[0] : query.status;
  const filter = parseBrickStatusFilter(raw);
  let rows = null;
  let unavailable = false;
  try {
    rows = await loadBrickRows(await isPublicMode());
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }
  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/n/youtube" className="calendar-back">
        YouTube
      </Link>
      {rows ? <YouTubeBrickList rows={rows} filter={filter} /> : null}
    </OperatorShell>
  );
}
