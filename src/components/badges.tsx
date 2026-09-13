import { venueKind } from "@/lib/robinhood";
import {
  REPORT_ATTESTATION_ATTESTED,
  type ReportAttestationStatus,
} from "@/lib/reports";
import type {
  AgenticIntentStatus,
  AttestationStatus,
  DecisionStatus,
  NodeSleeve,
  Provenance,
  PositionStatus,
} from "@/lib/types";

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

const attestationStyles: Record<AttestationStatus, string> = {
  web2_only: "border-[color:var(--border)] text-[color:var(--muted)]",
  pending_operator_ack:
    "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
  hashgraph_queued:
    "border-[color:var(--accent-2)]/35 bg-[color:var(--accent-2)]/10 text-[color:var(--accent-2)]",
  hashgraph_attested:
    "border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]",
};

const attestationLabel: Record<AttestationStatus, string> = {
  web2_only: "Web2 only",
  pending_operator_ack: "Pending operator ack",
  hashgraph_queued: "Hashgraph queued",
  hashgraph_attested: "Hashgraph attested",
};

export function AttestationStatusBadge({ value }: { value: AttestationStatus }) {
  return (
    <span className={`badge ${attestationStyles[value]}`}>
      {attestationLabel[value]}
    </span>
  );
}

export function ReportAttestationBadge({
  value,
}: {
  value: ReportAttestationStatus;
}) {
  if (value === REPORT_ATTESTATION_ATTESTED) {
    return (
      <span className={`badge ${attestationStyles.hashgraph_attested}`}>
        Attested
      </span>
    );
  }
  return (
    <span className={`badge ${attestationStyles.web2_only}`}>
      Not yet attested
    </span>
  );
}

const venueStyles = {
  robinhood:
    "border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]",
  xaman:
    "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
  coinbase:
    "border-[color:var(--accent-2)]/35 bg-[color:var(--accent-2)]/10 text-[color:var(--accent-2)]",
  metamask:
    "border-[color:var(--border)] bg-[color:var(--surface-2)] text-[color:var(--muted)]",
  other: "border-[color:var(--border)] text-[color:var(--muted)]",
} as const;

export function VenueBadge({ value }: { value: string }) {
  if (!value.trim()) return null;
  return (
    <span className={`badge ${venueStyles[venueKind(value)]}`}>{value}</span>
  );
}

const sleeveStyles: Record<NodeSleeve, string> = {
  main: "border-[color:var(--accent-2)]/35 bg-[color:var(--accent-2)]/10 text-[color:var(--accent-2)]",
  agentic:
    "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
  none: "border-[color:var(--border)] text-[color:var(--muted)]",
};

const sleeveLabel: Record<NodeSleeve, string> = {
  main: "Main",
  agentic: "Agentic",
  none: "Unassigned",
};

export function SleeveBadge({ value }: { value: NodeSleeve }) {
  if (value === "none") return null;
  return <span className={`badge ${sleeveStyles[value]}`}>{sleeveLabel[value]}</span>;
}

const intentStyles: Record<AgenticIntentStatus, string> = {
  queued:
    "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
  filled:
    "border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]",
  cancelled:
    "border-[color:var(--muted)]/40 bg-[color:var(--surface-2)] text-[color:var(--muted)]",
};

export function IntentStatusBadge({ value }: { value: AgenticIntentStatus }) {
  return (
    <span className={`badge ${intentStyles[value]}`}>
      {value === "queued" ? "Queued ≠ filled" : value}
    </span>
  );
}
