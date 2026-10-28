import Link from "next/link";
import { BackupFloor } from "@/components/backup-floor";
import { OperatorShell } from "@/components/operator-shell";
import { backupDetailLines, loadLatestBackupRun } from "@/lib/backup";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Backup · Resonance 2.0",
};

export default async function BackupPage() {
  const publicMode = await isPublicMode();
  let lines = backupDetailLines(null, publicMode);
  let unavailable = false;
  try {
    lines = backupDetailLines(await loadLatestBackupRun(), publicMode);
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/n/build" className="calendar-back">
        Build
      </Link>
      <BackupFloor lines={lines} />
    </OperatorShell>
  );
}
