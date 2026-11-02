import Link from "next/link";
import {
  NODE_STATUS_LABEL,
  deriveNodeStatus,
  formatUpdatedCt,
  type NodePart,
} from "@/lib/node-layout";

/**
 * Node name, a status pill taken from the loaded parts, the data's latest
 * timestamp in America/Chicago, and Back. Back goes up exactly one level.
 * No timestamp: the updated line is omitted. The render clock is never used.
 */
export function NodeHeader({
  name,
  parts,
  updatedAt,
  backHref,
}: {
  name: string;
  parts: readonly NodePart[];
  updatedAt?: string | null;
  backHref: string;
}) {
  const status = deriveNodeStatus(parts);
  const updated = formatUpdatedCt(updatedAt);
  return (
    <header className="node-header">
      <Link href={backHref} className="calendar-back node-back">
        Back
      </Link>
      <div className="node-header-row">
        <h2 className="node-header-name">{name}</h2>
        <span className={`node-status node-status-${status}`} data-node-status={status}>
          {NODE_STATUS_LABEL[status]}
        </span>
      </div>
      {updated ? <p className="node-updated">{updated}</p> : null}
    </header>
  );
}
