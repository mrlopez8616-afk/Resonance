import { ApprovalDecision } from "@/components/approval-decision";
import {
  approvalMeta,
  decisionLine,
  formatApprovalWhen,
  type Approval,
} from "@/lib/approvals";

export function ApprovalList({
  items,
  mode,
}: {
  items: readonly Approval[];
  mode: "pending" | "done";
}) {
  const heading = mode === "pending" ? "Pending" : "Done";
  const countLine =
    mode === "pending"
      ? `${items.length} waiting`
      : `${items.length} recorded`;
  return (
    <section className="approval-queue" aria-label={heading}>
      <header className="approval-heading">
        <h2>{heading}</h2>
        <p>{countLine}</p>
      </header>
      {items.length === 0 ? (
        <p className="parent-empty">
          {mode === "pending" ? "Nothing is waiting." : "Nothing is recorded."}
        </p>
      ) : (
        <div className="approval-list">
          {items.map((item) => {
            const result = decisionLine(item);
            return (
              <article key={item.id} className="approval-card" data-approval-id={item.id}>
                <h3>{item.title}</h3>
                <p className="approval-meta">{approvalMeta(item)}</p>
                {item.detail ? <p className="approval-detail">{item.detail}</p> : null}
                <p className="approval-when">Asked {formatApprovalWhen(item.createdAt)}</p>
                {mode === "pending" ? (
                  <ApprovalDecision id={item.id} title={item.title} />
                ) : result ? (
                  <p className="approval-result">{result}</p>
                ) : null}
                {item.decisionNote ? <p className="approval-detail">{item.decisionNote}</p> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
