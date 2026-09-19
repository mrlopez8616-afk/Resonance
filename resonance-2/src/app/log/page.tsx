import { FillLog } from "@/components/fill-log";
import { OperatorShell } from "@/components/operator-shell";
import { listFills } from "@/lib/fills";

export default function OperatorLogPage() {
  const fills = listFills();

  return (
    <OperatorShell>
      <div className="log-canvas">
        <header className="log-header">
          <p className="log-kicker">Operator log</p>
          <h2 className="log-title">Agentic sleeve fills</h2>
          <p className="log-meta">
            {fills.length} fill{fills.length === 1 ? "" : "s"} · static file ·
            no live brokerage
          </p>
        </header>
        <FillLog fills={fills} />
      </div>
    </OperatorShell>
  );
}
