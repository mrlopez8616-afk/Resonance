import Link from "next/link";
import { NodeSquare } from "@/components/node-square";

export function ApprovalsParent({ pending, done }: { pending: number; done: number }) {
  return (
    <section className="node-grid home-floor" aria-label="Approval queue">
      <NodeSquare parent home live={pending > 0} dashed={pending === 0} label="Pending">
        <Link href="/n/approvals/pending" className="node-log-link" title="Open Pending">
          <div className="live-face parent-face">
            <h2 className="node-ticker">Pending</h2>
            <p className="live-units">{pending}</p>
            <ul className="parent-lines">
              <li>waiting</li>
            </ul>
          </div>
        </Link>
      </NodeSquare>
      <NodeSquare parent home live={done > 0} dashed={done === 0} label="Done">
        <Link href="/n/approvals/done" className="node-log-link" title="Open Done">
          <div className="live-face parent-face">
            <h2 className="node-ticker">Done</h2>
            <p className="live-units">{done}</p>
            <ul className="parent-lines">
              <li>recorded</li>
            </ul>
          </div>
        </Link>
      </NodeSquare>
    </section>
  );
}
