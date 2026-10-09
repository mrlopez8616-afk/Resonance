import Link from "next/link";
import { BuildParent } from "@/components/build-floor";
import { OperatorShell } from "@/components/operator-shell";
import { deriveBuildSections } from "@/lib/build-tracker";
import { loadBuildView } from "@/lib/build-store";
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
        />
      ) : null}
    </OperatorShell>
  );
}
