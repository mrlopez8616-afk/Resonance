import { NodeHeader, NodeLayout, NodeSection, NodeSections } from "@/components/node-layout";
import { SystemLiveGate } from "@/components/system-live-gate";
import { SystemLensNav } from "@/components/system-map";
import { OperatorShell } from "@/components/operator-shell";
import { readLivePublicMode } from "@/lib/system-public";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Live · System · Resonance 2.0",
};

export default async function SystemLivePage() {
  const publicMode = await readLivePublicMode();
  return (
    <OperatorShell>
      <NodeLayout>
        <NodeHeader name="Live" parts={["live"]} backHref="/n/system" />
        <NodeSections>
          <NodeSection kind="lists" label="System">
            <div className="system-live">
              <SystemLensNav live />
              <SystemLiveGate publicMode={publicMode} />
            </div>
          </NodeSection>
        </NodeSections>
      </NodeLayout>
    </OperatorShell>
  );
}
