import Link from "next/link";
import { RoundtableParent } from "@/components/roundtable-floor";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { loadRoundtableCards } from "@/lib/roundtable-store";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Roundtable · Resonance 2.0",
};

export default async function RoundtablePage() {
  await requireRole("owner");
  const publicMode = await isPublicMode();

  let cards = null;
  let unavailable = false;
  try {
    cards = await loadRoundtableCards(publicMode);
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      {cards ? <RoundtableParent cards={cards} publicMode={publicMode} /> : null}
    </OperatorShell>
  );
}
