import Link from "next/link";
import { BuildFloor } from "@/components/build-floor";
import { OperatorShell } from "@/components/operator-shell";
import { loadBuildBoard } from "@/lib/build-store";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Build · Resonance 2.0",
};

export default async function BuildPage() {
  let board = null;
  let unavailable = false;
  try {
    board = await loadBuildBoard();
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      {board ? <BuildFloor board={board} /> : null}
    </OperatorShell>
  );
}
