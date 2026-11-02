import { ApprovalDecision } from "@/components/approval-decision";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import {
  approvalMeta,
  decisionLine,
  formatApprovalWhen,
  type Approval,
} from "@/lib/approvals";
import { latestTimestamp, type NodePart } from "@/lib/node-layout";
import { hasMoneyText, stripMoneyText } from "@/lib/public-mode";

function approvalHasMoney(item: Approval): boolean {
  return (
    hasMoneyText(item.title) ||
    hasMoneyText(item.detail) ||
    hasMoneyText(item.decisionNote ?? "")
  );
}

function approvalParts(items: readonly Approval[], publicMode: boolean): NodePart[] {
  const rows: NodePart[] =
    items.length === 0
      ? ["missing"]
      : items.map((item) => (publicMode && approvalHasMoney(item) ? "missing" : "live"));
  // The count is a real reading. An empty list, or a locked money row, is the other part.
  return ["live", ...rows];
}

function approvalUpdated(items: readonly Approval[]): string | null {
  return latestTimestamp(items.flatMap((item) => [item.createdAt, item.decidedAt]));
}

export function ApprovalList({
  items,
  mode,
  publicMode = false,
}: {
  items: readonly Approval[];
  mode: "pending" | "done";
  publicMode?: boolean;
}) {
  const heading = mode === "pending" ? "Pending" : "Done";
  const countLine = mode === "pending" ? "waiting" : "recorded";
  return (
    <NodeLayout>
      <NodeHeader
        name={heading}
        parts={approvalParts(items, publicMode)}
        updatedAt={approvalUpdated(items)}
        backHref="/n/approvals"
      />
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            <StatCard label={heading} value={String(items.length)} detail={countLine} />
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="lists">
          <NodeGrid>
            {items.length === 0 ? (
              <EmptyCard label={heading} span="list" />
            ) : (
              items.map((item) => {
                if (publicMode && approvalHasMoney(item)) {
                  const meta = approvalMeta(item);
                  return (
                    <StatCard
                      key={item.id}
                      span="list"
                      label={hasMoneyText(meta) ? "Request" : meta}
                      locked
                    />
                  );
                }
                const result = decisionLine(item);
                const title = publicMode ? stripMoneyText(item.title) || "Request" : item.title;
                const detail = publicMode && item.detail ? stripMoneyText(item.detail) : item.detail;
                const note = publicMode && item.decisionNote ? stripMoneyText(item.decisionNote) : item.decisionNote;
                const when = formatApprovalWhen(item.createdAt);
                return (
                  <StatCard
                    key={item.id}
                    span="list"
                    label={approvalMeta(item)}
                    value={title}
                    detail={when ? `Asked ${when}` : null}
                  >
                    {detail ? <p className="node-card-detail">{detail}</p> : null}
                    {mode === "pending" && !publicMode ? (
                      <ApprovalDecision id={item.id} title={item.title} />
                    ) : result ? (
                      <p className="node-card-detail">{result}</p>
                    ) : null}
                    {note ? <p className="node-card-detail">{note}</p> : null}
                  </StatCard>
                );
              })
            )}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
