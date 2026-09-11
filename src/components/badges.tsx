import type { DecisionStatus, Provenance, PositionStatus } from "@/lib/types";

const provenanceStyles: Record<Provenance, string> = {
  verified:
    "border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]",
  "founder-reported":
    "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
  unverified:
    "border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]",
};

const provenanceLabel: Record<Provenance, string> = {
  verified: "Verified",
  "founder-reported": "Founder-reported",
  unverified: "Unverified",
};

const statusStyles: Record<PositionStatus, string> = {
  none: "border-[color:var(--border)] text-[color:var(--muted)]",
  watch:
    "border-[color:var(--accent-2)]/35 bg-[color:var(--accent-2)]/10 text-[color:var(--accent-2)]",
  funded:
    "border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]",
};

export function ProvenanceBadge({ value }: { value: Provenance }) {
  return (
    <span className={`badge ${provenanceStyles[value]}`}>
      {provenanceLabel[value]}
    </span>
  );
}

export function StatusBadge({ value }: { value: PositionStatus }) {
  const label = value === "none" ? "None" : value === "watch" ? "Watch" : "Funded";
  return <span className={`badge ${statusStyles[value]}`}>{label}</span>;
}

export function ClassBadge({ value }: { value: "digital" | "physical" }) {
  return (
    <span className="badge border-[color:var(--border)] text-[color:var(--muted)]">
      {value === "digital" ? "Digital" : "Physical"}
    </span>
  );
}

export function SnapshotBadge() {
  return (
    <span className="badge border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]">
      Verified-from-snapshot
    </span>
  );
}

const decisionStatusStyles: Record<DecisionStatus, string> = {
  decided:
    "border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]",
  pending:
    "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
  superseded:
    "border-[color:var(--muted)]/40 bg-[color:var(--surface-2)] text-[color:var(--muted)]",
};

const decisionStatusLabel: Record<DecisionStatus, string> = {
  decided: "Decided",
  pending: "Pending",
  superseded: "Superseded",
};

export function DecisionStatusBadge({ value }: { value: DecisionStatus }) {
  return (
    <span className={`badge ${decisionStatusStyles[value]}`}>
      {decisionStatusLabel[value]}
    </span>
  );
}
