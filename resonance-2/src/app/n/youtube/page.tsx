import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { YouTubeParent } from "@/components/youtube-node";
import { requireRole } from "@/lib/auth-session";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { brickParentCard } from "@/lib/youtube-bricks";
import { loadBrickCounts } from "@/lib/youtube-bricks-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "YouTube · Resonance 2.0",
};

export default async function YouTubePage() {
  await requireRole("owner");
  let brick = undefined;
  let unavailable = false;
  try {
    brick = brickParentCard(await loadBrickCounts());
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }
  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      <YouTubeParent brick={brick} />
    </OperatorShell>
  );
}
