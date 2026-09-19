import { FillLog } from "@/components/fill-log";
import { OperatorShell } from "@/components/operator-shell";
import { loadOperatorFills } from "@/lib/sleeve-prints";

export const dynamic = "force-dynamic";

export default async function OperatorLogPage() {
  const { fills, backend, configured } = await loadOperatorFills();
  const source =
    configured && backend === "blob"
      ? "durable store"
      : configured
        ? "local store"
        : "seed fallback";

  return (
    <OperatorShell>
      <div className="log-canvas">
        <header className="log-header">
          <p className="log-kicker">Operator log</p>
          <h2 className="log-title">Agentic sleeve fills</h2>
          <p className="log-meta">
            {fills.length} fill{fills.length === 1 ? "" : "s"} · {source} ·
            hub POST · no live brokerage
          </p>
        </header>
        <FillLog fills={fills} />
      </div>
    </OperatorShell>
  );
}
