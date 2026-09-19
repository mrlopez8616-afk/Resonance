import { FLOOR_NODES } from "@/data/floor-nodes";
import { NodeSquare } from "@/components/node-square";
import { XrpFace } from "@/components/xrp-face";
import type { XrpFaceData } from "@/lib/xrp-face";

export function NodeGrid({ face }: { face: XrpFaceData }) {
  return (
    <section className="node-grid" aria-label="Node floor">
      {FLOOR_NODES.map((node) => {
        if (node.status === "live") {
          return (
            <NodeSquare key={node.id} live label="XRP live node">
              <XrpFace initial={face} />
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
