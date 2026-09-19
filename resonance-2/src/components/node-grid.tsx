import { LiveNodeFace } from "@/components/live-node-face";
import { NodeSquare } from "@/components/node-square";
import { FLOOR_NODES } from "@/data/floor-nodes";
import { SUI_SLEEVES } from "@/data/sui-sleeves";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import type { NodeSleeve } from "@/data/sleeves";
import type { LiveFaceData } from "@/lib/live-face";

const LIVE_SLEEVES: Record<string, readonly NodeSleeve[]> = {
  XRP: XRP_SLEEVES,
  SUI: SUI_SLEEVES,
};

export function NodeGrid({ faces }: { faces: Record<string, LiveFaceData> }) {
  return (
    <section className="node-grid" aria-label="Node floor">
      {FLOOR_NODES.map((node) => {
        if (node.status === "live") {
          const face = faces[node.ticker];
          const sleeves = LIVE_SLEEVES[node.ticker];
          if (!face || !sleeves) {
            return (
              <NodeSquare
                key={node.id}
                dashed
                label={`${node.ticker} offline`}
              >
                <h2 className="node-ticker">{node.ticker}</h2>
                <p className="node-note">offline</p>
              </NodeSquare>
            );
          }
          return (
            <NodeSquare
              key={node.id}
              live
              label={`${node.ticker} live node`}
            >
              <LiveNodeFace
                ticker={node.ticker}
                sleeves={sleeves}
                initial={face}
              />
            </NodeSquare>
          );
        }

        if (node.status === "empty") {
          return (
            <NodeSquare key={node.id} dashed empty label="Empty node slot">
              <span className="node-plus" aria-hidden>
                +
              </span>
            </NodeSquare>
          );
        }

        return (
          <NodeSquare
            key={node.id}
            dashed
            label={`${node.ticker} offline`}
          >
            <h2 className="node-ticker">{node.ticker}</h2>
            <p className="node-note">{node.note ?? "offline"}</p>
          </NodeSquare>
        );
      })}
    </section>
  );
}
