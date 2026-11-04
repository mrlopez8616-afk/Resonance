import { OperatorShell } from "@/components/operator-shell";
import { YouTubeGearList, type GearRecording } from "@/components/youtube-node";
import { requireRole } from "@/lib/auth-session";
import { formatBytes, formatDuration, formatObsTime } from "@/lib/obs";
import { readObsPage } from "@/lib/obs-store";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gear · YouTube · Resonance 2.0",
};

export default async function YouTubeGearPage() {
  await requireRole("owner");
  let recordings: GearRecording[] = [];
  let updatedAt: string | null = null;
  let lastSeenLabel: string | null = null;
  let unavailable = false;
  try {
    const page = await readObsPage();
    recordings = page.recordings.map((row) => ({
      key: row.key,
      fileName: row.fileName,
      length: formatDuration(row.durationSec),
      size: formatBytes(row.sizeBytes),
      time: formatObsTime(row.createdAt),
    }));
    updatedAt = page.lastSeen;
    lastSeenLabel = page.lastSeen ? formatObsTime(page.lastSeen) : null;
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }
  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <YouTubeGearList recordings={recordings} updatedAt={updatedAt} lastSeenLabel={lastSeenLabel} />
    </OperatorShell>
  );
}
