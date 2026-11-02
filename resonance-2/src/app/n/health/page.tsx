import { HealthFloor } from "@/components/machine-health-floor";
import { NodeHeader, NodeLayout, NodeSection, NodeSections } from "@/components/node-layout";
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
      {report ? (
        <HealthFloor report={report} />
      ) : (
        <NodeLayout>
          <NodeHeader name="Health of the Machine" parts={["missing"]} backHref="/" />
          <NodeSections>
            <NodeSection kind="numbers" empty />
          </NodeSections>
        </NodeLayout>
      )}
    </OperatorShell>
  );
}
