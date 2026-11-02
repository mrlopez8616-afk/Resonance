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
  let updatedAt: string | null = null;
  let unavailable = false;
  try {
    const run = await loadLatestBackupRun();
    lines = backupDetailLines(run, publicMode);
    updatedAt = run?.startedAt ?? null;
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <BackupFloor lines={lines} updatedAt={updatedAt} />
    </OperatorShell>
  );
}
