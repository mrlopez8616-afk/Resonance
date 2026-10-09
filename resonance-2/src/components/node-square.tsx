import type { ReactNode } from "react";

export function NodeSquare({
  live = false,
  dashed = false,
  empty = false,
  parent = false,
  home = false,
  wide = false,
  label,
  onDelete,
  children,
}: {
  live?: boolean;
  dashed?: boolean;
  empty?: boolean;
  parent?: boolean;
  /** Home parent card. Lets the square grow so secondary lines stay visible. */
  home?: boolean;
  /** Home card that needs a wider chart, such as the eight AI Stocks bars. */
  wide?: boolean;
  label: string;
  onDelete?: () => void;
  children: ReactNode;
}) {
  const state = live ? "is-live" : dashed ? "is-offline" : "";
  return (
    <article
      className={`node-square ${state} ${empty ? "is-empty" : ""} ${parent ? "is-parent" : ""} ${home ? "is-home" : ""} ${wide ? "is-wide" : ""}`}
      aria-label={label}
    >
      {onDelete ? (
        <button
          type="button"
          className="node-delete"
          aria-label="Delete node"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <span aria-hidden>×</span>
        </button>
      ) : null}
      {children}
    </article>
  );
}
