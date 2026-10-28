import Link from "next/link";
import { BuildParent } from "@/components/build-floor";
import { OperatorShell } from "@/components/operator-shell";
import { backupFace, loadLatestBackupRun } from "@/lib/backup";
import { buildHomeCard, deriveBuildSections } from "@/lib/build-tracker";
import { loadBuildView } from "@/lib/build-store";
import { hasMoneyText } from "@/lib/public-mode";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Build · Resonance 2.0",
};

export default async function BuildPage() {
  let view = null;
  let unavailable = false;
  try {
    view = await loadBuildView();
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }
  const pub = await isPublicMode();
  let backupUnavailable = false;
  let backupRun = null;
  try {
    backupRun = await loadLatestBackupRun();
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    backupUnavailable = true;
  }
  const notes = view
    ? buildHomeCard(view.items).lines.filter((line) => !(pub && hasMoneyText(line)))
    : [];

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      {view ? (
        <BuildParent
          totalPercent={view.totalPercent}
          githubFresh={view.githubFresh}
          sections={deriveBuildSections(view.items)}
          notes={notes}
          backup={backupFace(backupRun, pub, backupUnavailable)}
        />
      ) : null}
    </OperatorShell>
  );
}
