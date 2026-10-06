"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { FloorDialog } from "@/components/floor-dialog";
import { NodeSquare } from "@/components/node-square";
import { ValueCard } from "@/components/value-card";
import type { FloorNode } from "@/data/floor-nodes";
import {
  hiddenIdsServerSnapshot,
  hiddenIdsSnapshot,
  parseHiddenIds,
  subscribeHiddenIds,
  writeHiddenIds,
} from "@/lib/floor-registry";
import { nodesOnParent, removedOnParent } from "@/lib/node-parents";
import type { ValueCardModel } from "@/lib/value-card";
import type { ParentId } from "@/data/node-parents";

const NOT_CONNECTED: ValueCardModel = {
  headline: null,
  priceLine: null,
  label: "not connected",
};

export function NodeGrid({
  parentId,
  parentLabel,
  cards,
}: {
  parentId: ParentId;
  parentLabel: string;
  /** One shared value-card model per ticker. Missing tickers are not connected. */
  cards: Readonly<Record<string, ValueCardModel>>;
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

  const nodes = nodesOnParent(hiddenIds, parentId);
  const removed = removedOnParent(hiddenIds, parentId);

  if (nodes.length === 0) {
    return (
      <p className="parent-empty" role="status">
        not connected yet
      </p>
    );
  }

  return (
    <>
      <section className="node-grid" aria-label={`${parentLabel} nodes`}>
        {nodes.map((node) => {
          if (node.status === "live") {
            const card = cards[node.ticker] ?? NOT_CONNECTED;
            const shown = card.headline !== null || card.priceLine !== null;
            return (
              <NodeSquare
                key={node.id}
                parent
                live={shown}
                dashed={!shown}
                label={`${node.ticker} node`}
                onDelete={() => setPending(node)}
              >
                <Link
                  href={`/n/${parentId}/${node.id}`}
                  className="node-log-link"
                  title={`Open ${node.ticker}`}
                >
                  <ValueCard ticker={node.ticker} model={card} compact />
                </Link>
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

          return null;
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
            No removed nodes. Delete a live square first, then restore it here.
            Live nodes re-stand. Offline roster tickers stay in the cabinet and
            stay off this floor until they are live.
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
