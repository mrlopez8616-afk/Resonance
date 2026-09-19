import type { ReactNode } from "react";

export function NodeSquare({
  live = false,
  dashed = false,
  empty = false,
  label,
  onDelete,
  children,
}: {
  live?: boolean;
  dashed?: boolean;
  empty?: boolean;
  label: string;
  onDelete?: () => void;
  children: ReactNode;
}) {
  const state = live ? "is-live" : dashed ? "is-offline" : "";
  return (
    <article
      className={`node-square ${state} ${empty ? "is-empty" : ""}`}
      aria-label={label}
    >
      {onDelete ? (
        <button
          type="button"
          className="node-delete"
          aria-label="Delete node"
          onClick={onDelete}
        >
          <span aria-hidden>×</span>
        </button>
      ) : null}
      {children}
    </article>
  );
}
