"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { FloorDialog } from "@/components/floor-dialog";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import type { FloorNode } from "@/data/floor-nodes";
import {
  hiddenIdsServerSnapshot,
  hiddenIdsSnapshot,
  parseHiddenIds,
  subscribeHiddenIds,
  writeHiddenIds,
} from "@/lib/floor-registry";
import { isZeroCryptoHolding, nodesOnParent, removedOnParent } from "@/lib/node-parents";
import type { ChildCardModel } from "@/lib/child-card";
import { valueTileFace } from "@/lib/home-faces";
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
  heldUsd,
  childCards,
  extra = null,
}: {
  parentId: ParentId;
  parentLabel: string;
  /** One shared value-card model per ticker. Missing tickers are not connected. */
  cards: Readonly<Record<string, ValueCardModel>>;
  /** Position value in dollars. A crypto card at exactly zero is not painted. */
  heldUsd?: Readonly<Record<string, number | null | undefined>>;
  /** Child value facts. When a ticker is present, its headline and price replace the plain card. */
  childCards?: Readonly<Record<string, ChildCardModel>>;
  /** One more child card, such as the XRP trigger watch. */
  extra?: ReactNode;
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
    if (!extra) {
      return (
        <p className="parent-empty" role="status">
          not connected yet
        </p>
      );
    }
    return <NodeFaceGrid label={`${parentLabel} nodes`}>{extra}</NodeFaceGrid>;
  }

  return (
    <>
      <NodeFaceGrid label={`${parentLabel} nodes`}>
        {nodes.map((node) => {
          if (node.status === "live") {
            if (isZeroCryptoHolding(node.ticker, heldUsd?.[node.ticker])) return null;
            const child = childCards?.[node.ticker];
            const card = child
              ? { headline: child.headline, priceLine: child.priceLine, label: child.label }
              : (cards[node.ticker] ?? NOT_CONNECTED);
            return (
              <NodeFace
                key={node.id}
                onRemove={() => setPending(node)}
                face={valueTileFace({
                  id: node.id,
                  glyph: parentId,
                  href: `/n/${parentId}/${node.id}`,
                  name: node.ticker,
                  headline: card.headline,
                  priceLine: card.priceLine,
                  label: card.label,
                })}
              />
            );
          }

          if (node.status === "empty") {
            return (
              <article key={node.id} className="node-face is-offline" aria-label="Empty node slot">
                <button
                  type="button"
                  className="node-face-link node-add"
                  aria-label="Add node"
                  onClick={() => setAdding(true)}
                >
                  <span className="node-face-glyph" aria-hidden="true">
                    +
                  </span>
                  <h2 className="node-face-name">Empty</h2>
                  <p className="node-face-headline">+</p>
                  <p className="node-face-status">add</p>
                </button>
              </article>
            );
          }

          return null;
        })}
        {extra}
      </NodeFaceGrid>

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
