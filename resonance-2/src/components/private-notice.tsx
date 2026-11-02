import type { ReactNode } from "react";
import { NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import { OperatorShell } from "@/components/operator-shell";
import { isPublicMode } from "@/lib/public-mode-server";

/** Locked finance page. The card keeps its size and does not render a value. */
export function PrivateNotice() {
  return (
    <NodeLayout>
      <NodeHeader name="Finance" parts={["missing"]} backHref="/" />
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            <StatCard label="Finance" locked />
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

export async function PrivatePage() {
  return (
    <OperatorShell>
      <PrivateNotice />
    </OperatorShell>
  );
}

/** The hidden-route body, or null when public mode is off. */
export async function blockedPublicPage(): Promise<ReactNode | null> {
  if (!(await isPublicMode())) return null;
  return <PrivatePage />;
}
