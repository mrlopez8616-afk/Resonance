"use client";

import { useState, useSyncExternalStore } from "react";
import { FloorDialog } from "@/components/floor-dialog";
import { LiveNodeFace } from "@/components/live-node-face";
import { NodeSquare } from "@/components/node-square";
import type { FloorNode } from "@/data/floor-nodes";
import { CEG_SLEEVES } from "@/data/ceg-sleeves";
import { ETN_SLEEVES } from "@/data/etn-sleeves";
import { GEV_SLEEVES } from "@/data/gev-sleeves";
import { HUBB_SLEEVES } from "@/data/hubb-sleeves";
import { PWR_SLEEVES } from "@/data/pwr-sleeves";
import { SUI_SLEEVES } from "@/data/sui-sleeves";
import { VRT_SLEEVES } from "@/data/vrt-sleeves";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import type { NodeSleeve } from "@/data/sleeves";
import type { LiveFaceData } from "@/lib/live-face";
import {
  hiddenIdsServerSnapshot,
  hiddenIdsSnapshot,
  parseHiddenIds,
  removedNodes,
  subscribeHiddenIds,
  visibleNodes,
  writeHiddenIds,
} from "@/lib/floor-registry";

const SEED_SLEEVES: Record<string, readonly NodeSleeve[]> = {
  XRP: XRP_SLEEVES,
  SUI: SUI_SLEEVES,
  PWR: PWR_SLEEVES,
  ETN: ETN_SLEEVES,
  VRT: VRT_SLEEVES,
  GEV: GEV_SLEEVES,
  CEG: CEG_SLEEVES,
  HUBB: HUBB_SLEEVES,
};

export function NodeGrid({
  faces,
  sleeves: sleeveBooks = SEED_SLEEVES,
}: {
  faces: Record<string, LiveFaceData>;
  sleeves?: Record<string, readonly NodeSleeve[]>;
}) {
  const hiddenRaw = useSyncExternalStore(
    subscribeHiddenIds,
    hiddenIdsSnapshot,
    hiddenIdsServerSnapshot,
  );
  const hiddenIds = parseHiddenIds(hiddenRaw);
  const [pending, setPending] = useState<FloorNode | null>(null);
  const [adding, setAdding] = useState(false);

  function hideNode(id: string) {
    writeHiddenIds([...new Set([...hiddenIds, id])]);
    setPending(null);
  }

  function restoreNode(id: string) {
    writeHiddenIds(hiddenIds.filter((hidden) => hidden !== id));
    setAdding(false);
  }

  const nodes = visibleNodes(hiddenIds);
  const removed = removedNodes(hiddenIds);

  return (
    <>
      <section className="node-grid" aria-label="Node floor">
        {nodes.map((node) => {
          if (node.status === "live") {
            const face = faces[node.ticker];
            const sleeves = sleeveBooks[node.ticker] ?? SEED_SLEEVES[node.ticker];
            if (!face || !sleeves) {
              return (
                <NodeSquare
                  key={node.id}
                  dashed
                  label={`${node.ticker} offline`}
                  onDelete={() => setPending(node)}
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
                onDelete={() => setPending(node)}
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
                <button
                  type="button"
                  className="node-add"
                  aria-label="Add node"
                  onClick={() => setAdding(true)}
                >
                  <span aria-hidden>+</span>
                </button>
              </NodeSquare>
            );
          }

          return (
            <NodeSquare
              key={node.id}
              dashed
              label={`${node.ticker} offline`}
              onDelete={() => setPending(node)}
            >
              <h2 className="node-ticker">{node.ticker}</h2>
              <p className="node-note">{node.note ?? "offline"}</p>
            </NodeSquare>
          );
        })}
      </section>

      <FloorDialog
        open={pending !== null}
        title={pending ? `Remove ${pending.ticker}?` : "Remove node?"}
        onClose={() => setPending(null)}
      >
        <p className="floor-dialog-copy">
          This only hides {pending?.ticker ?? "the node"} on the operator floor.
          Sleeve prints, Flare vault config, and the operator fill log stay put.
        </p>
        <div className="floor-dialog-actions">
          <button
            type="button"
            className="floor-dialog-cancel"
            onClick={() => setPending(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="floor-dialog-confirm"
            disabled={!pending}
            onClick={() => {
              if (pending) hideNode(pending.id);
            }}
          >
            Remove from floor
          </button>
        </div>
      </FloorDialog>

      <FloorDialog
        open={adding}
        title="Add node"
        onClose={() => setAdding(false)}
      >
        {removed.length === 0 ? (
          <p className="floor-dialog-copy">
            No removed nodes. Delete a square first, then restore it here as it
            last stood (live XRP/SUI/PWR/ETN/VRT/GEV/CEG/HUBB re-stand; others come back offline).
          </p>
        ) : (
          <ul className="floor-restore-list">
            {removed.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className="floor-restore"
                  onClick={() => restoreNode(node.id)}
                >
                  {node.ticker}
                  <span>{node.status === "live" ? "re-stand" : "offline"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="floor-dialog-actions">
          <button
            type="button"
            className="floor-dialog-cancel"
            onClick={() => setAdding(false)}
          >
            Close
          </button>
        </div>
      </FloorDialog>
    </>
  );
}
