import Link from "next/link";
import { HealthFloor } from "@/components/machine-health-floor";
import { OperatorShell } from "@/components/operator-shell";
import { requireRole } from "@/lib/auth-session";
import { loadMachineHealth } from "@/lib/machine-health-load";
import { isPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Health of the Machine · Resonance 2.0",
};

export default async function HealthPage() {
  await requireRole("owner");
  const publicMode = await isPublicMode();
  let report = null;
  let unavailable = false;
  try {
    const loaded = await loadMachineHealth({ publicMode });
    report = loaded.report;
    unavailable = loaded.storageDown;
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    unavailable = true;
  }

  return (
    <OperatorShell storageMessage={unavailable ? STORAGE_UNAVAILABLE_BANNER : null}>
      <Link href="/" className="calendar-back">
        Floor
      </Link>
      {report ? <HealthFloor report={report} /> : null}
    </OperatorShell>
  );
}
