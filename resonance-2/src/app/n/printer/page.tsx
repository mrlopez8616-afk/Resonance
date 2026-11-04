import { PrinterFloor } from "@/components/printer-floor";
import { OperatorShell } from "@/components/operator-shell";
import { readPrinterPage } from "@/lib/printer-store";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Printer · Resonance 2.0",
};

export default async function PrinterPage() {
  let latest = null;
  let stale = false;
  let unavailable = false;
  try {
    const page = await readPrinterPage();
    latest = page.latest;
    stale = page.stale;
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <PrinterFloor latest={latest} stale={stale} unavailable={unavailable} />
    </OperatorShell>
  );
}
