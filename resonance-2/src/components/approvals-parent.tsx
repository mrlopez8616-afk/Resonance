import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { tileFace } from "@/lib/home-faces";

export function ApprovalsParent({ pending, done }: { pending: number; done: number }) {
  return (
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
  );
}
