import { FactorioFloor } from "@/components/factorio-floor";
import { OperatorShell } from "@/components/operator-shell";
import { readFactorioPage } from "@/lib/factorio-store";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Factorio · Resonance 2.0",
};

export default async function FactorioPage() {
  let latest = null;
  let history: Awaited<ReturnType<typeof readFactorioPage>>["history"] = [];
  let stale = false;
  let unavailable = false;
  try {
    const page = await readFactorioPage();
    latest = page.latest;
    history = page.history;
    stale = page.stale;
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <FactorioFloor latest={latest} history={history} stale={stale} unavailable={unavailable} />
    </OperatorShell>
  );
}
