"use client";

import type { ReactNode } from "react";
import { formatPct, formatUsd } from "@/lib/format";
import type { Node, Quote } from "@/lib/types";

export function NodePriceCell({
  node,
  live,
  liveStatus,
}: {
  node: Node;
  live: Quote | null;
  liveStatus: "idle" | "loading" | "ok" | "error";
}) {
  if (node.manualPriceUsd !== null) {
    return (
      <div>
        <p className="font-mono tabular-nums">
          {formatUsd(node.manualPriceUsd)}
        </p>
        <p className="text-xs text-[color:var(--muted)]">
          Manual · unverified
          {live ? ` · live ${formatUsd(live.usd)}` : ""}
        </p>
      </div>
    );
  }
  if (live) {
    return (
      <div>
        <p className="font-mono tabular-nums">{formatUsd(live.usd)}</p>
        <p
          className={`text-xs tabular-nums ${
            (live.change24hPct ?? 0) >= 0
              ? "text-[color:var(--ok)]"
              : "text-[color:var(--danger)]"
          }`}
        >
          {formatPct(live.change24hPct)} 24h
        </p>
      </div>
    );
  }
  if (liveStatus === "loading" || liveStatus === "idle") {
    return <p className="text-sm text-[color:var(--muted)]">Type a last price, or wait for a live feed</p>;
  }
  return (
    <p className="text-sm text-[color:var(--muted)]">Type a last price</p>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-[color:var(--muted)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "ok" | "danger" | "accent";
}) {
  const toneClass =
    tone === "ok"
      ? "text-[color:var(--ok)]"
      : tone === "danger"
        ? "text-[color:var(--danger)]"
        : tone === "accent"
          ? "text-[color:var(--accent)]"
          : "";
  return (
    <div className="card">
      <p className="kicker">{label}</p>
      <p className={`mt-3 text-2xl font-medium tabular-nums ${toneClass}`}>
        {value}
      </p>
      {hint ? (
        <div className="mt-2 text-sm text-[color:var(--muted)]">{hint}</div>
      ) : null}
    </div>
  );
}

export function ChangeChip({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="text-[color:var(--muted)]">—</span>;
  }
  const positive = value >= 0;
  return (
    <span
      className={`font-mono tabular-nums ${
        positive ? "text-[color:var(--ok)]" : "text-[color:var(--danger)]"
      }`}
    >
      {formatPct(value)}
    </span>
  );
}
