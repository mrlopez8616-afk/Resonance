import { ApprovalDecision } from "@/components/approval-decision";
import {
  approvalMeta,
  decisionLine,
  formatApprovalWhen,
  type Approval,
} from "@/lib/approvals";
import { stripMoneyText } from "@/lib/public-mode";

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
            const title = publicMode ? stripMoneyText(item.title) || "Request" : item.title;
            const detail = publicMode && item.detail ? stripMoneyText(item.detail) : item.detail;
            const note = publicMode && item.decisionNote ? stripMoneyText(item.decisionNote) : item.decisionNote;
            return (
              <article key={item.id} className="approval-card" data-approval-id={item.id}>
                <h3>{title}</h3>
                <p className="approval-meta">{approvalMeta(item)}</p>
                {detail ? <p className="approval-detail">{detail}</p> : null}
                <p className="approval-when">Asked {formatApprovalWhen(item.createdAt)}</p>
                {mode === "pending" && !publicMode ? (
                  <ApprovalDecision id={item.id} title={item.title} />
                ) : result ? (
                  <p className="approval-result">{result}</p>
                ) : null}
                {note ? <p className="approval-detail">{note}</p> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
