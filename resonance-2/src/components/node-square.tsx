import type { ReactNode } from "react";

export function NodeSquare({
  live = false,
  dashed = false,
  empty = false,
  label,
  children,
}: {
  live?: boolean;
  dashed?: boolean;
  empty?: boolean;
  label: string;
  children: ReactNode;
}) {
  const state = live ? "is-live" : dashed ? "is-offline" : "";
  return (
    <article
      className={`node-square ${state} ${empty ? "is-empty" : ""}`}
      aria-label={label}
    >
      {children}
    </article>
  );
}
