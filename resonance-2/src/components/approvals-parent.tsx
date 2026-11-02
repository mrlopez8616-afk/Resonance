import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { NodeHeader, NodeLayout, NodeSection, NodeSections } from "@/components/node-layout";
import { tileFace } from "@/lib/home-faces";
import { type NodePart } from "@/lib/node-layout";

/** Parent floor. Pending and Done only. Each request lives one level down. */
export function ApprovalsParent({
  pending,
  done,
  updatedAt = null,
}: {
  pending: number;
  done: number;
  updatedAt?: string | null;
}) {
  const parts: NodePart[] = ["live", "live"];
  return (
    <NodeLayout>
      <NodeHeader name="Approvals" parts={parts} updatedAt={updatedAt} backHref="/" />
      <NodeSections>
        <NodeSection kind="lists">
          <NodeFaceGrid label="Approval queue">
            <NodeFace
              face={tileFace({
                id: "pending",
                glyph: "control",
                href: "/n/approvals/pending",
                name: "Pending",
                headline: String(pending),
                status: "waiting",
                live: pending > 0,
              })}
            />
            <NodeFace
              face={tileFace({
                id: "done",
                glyph: "control",
                href: "/n/approvals/done",
                name: "Done",
                headline: String(done),
                status: "recorded",
                live: done > 0,
              })}
            />
          </NodeFaceGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
