"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ChildValueCard } from "@/components/child-value-card";
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
import { isZeroCryptoHolding, nodesOnParent, removedOnParent } from "@/lib/node-parents";
import type { ChildCardModel } from "@/lib/child-card";
import type { LotBarModel } from "@/lib/lot-bars";
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
  lotBars,
  extra = null,
}: {
  parentId: ParentId;
  parentLabel: string;
  /** One shared value-card model per ticker. Missing tickers are not connected. */
  cards: Readonly<Record<string, ValueCardModel>>;
  /** Position value in dollars. A crypto card at exactly zero is not painted. */
  heldUsd?: Readonly<Record<string, number | null | undefined>>;
  /** Content-sized child cards. When a ticker is present, it replaces the plain value card. */
  childCards?: Readonly<Record<string, ChildCardModel>>;
  /** Open-lot bars for a parent card. Present (even as null) replaces that card's sparkline. */
  lotBars?: Readonly<Record<string, LotBarModel | null>>;
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
    return (
      <section className={`node-grid${childCards ? " child-floor" : ""}`} aria-label={`${parentLabel} nodes`}>
        {extra}
      </section>
    );
  }

  return (
    <>
      <section
        className={`node-grid${childCards ? " child-floor" : ""}`}
        aria-label={`${parentLabel} nodes`}
      >
        {nodes.map((node) => {
          if (node.status === "live") {
            if (isZeroCryptoHolding(node.ticker, heldUsd?.[node.ticker])) return null;
            const child = childCards?.[node.ticker];
            const card = cards[node.ticker] ?? NOT_CONNECTED;
            const shown = child
              ? child.headline !== null ||
                child.priceLine !== null ||
                child.lines.length > 0 ||
                child.spark !== null
              : card.headline !== null || card.priceLine !== null;
            return (
              <NodeSquare
                key={node.id}
                parent
                home={Boolean(child)}
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
                  {child ? (
                    <ChildValueCard
                      model={lotBars ? { ...child, spark: null } : child}
                      lots={lotBars ? (lotBars[node.ticker] ?? null) : undefined}
                    />
                  ) : (
                    <ValueCard ticker={node.ticker} model={card} compact />
                  )}
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
        {extra}
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
