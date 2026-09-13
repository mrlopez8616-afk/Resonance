import { sortDecisions } from "./decisions";
import type { Decision, DecisionStatus } from "./types";

export const UNDATED_FOLDER_KEY = "undated";

export type DecisionArchiveStatus =
  | DecisionStatus
  | "attested";

export const ARCHIVE_STATUS_ORDER: DecisionArchiveStatus[] = [
  "pending",
  "decided",
  "superseded",
  "attested",
];

export interface DecisionStatusGroup {
  status: DecisionArchiveStatus;
  label: string;
  items: Decision[];
}

export interface DecisionDateFolder {
  key: string;
  label: string;
  count: number;
  items: Decision[];
  groups: DecisionStatusGroup[];
}

const ARCHIVE_STATUS_LABEL: Record<DecisionArchiveStatus, string> = {
  pending: "Pending",
  decided: "Decided",
  superseded: "Superseded",
  attested: "Attested",
};

export function isIsoDateFolderKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function decisionFolderKey(decision: Decision): string {
  const date = decision.date.trim();
  return isIsoDateFolderKey(date) ? date : UNDATED_FOLDER_KEY;
}

export function isOperatorAttested(decision: Decision): boolean {
  return decision.attestationStatus !== "web2_only";
}

/** Folder-list status. Operator-acked rows sit in Attested, not their call status. */
export function decisionArchiveStatus(
  decision: Decision,
): DecisionArchiveStatus {
  if (isOperatorAttested(decision)) return "attested";
  return decision.status;
}

export function archiveStatusLabel(status: DecisionArchiveStatus): string {
  return ARCHIVE_STATUS_LABEL[status];
}

export function groupDecisionsByArchiveStatus(
  decisions: Decision[],
): DecisionStatusGroup[] {
  const buckets = new Map<DecisionArchiveStatus, Decision[]>();
  for (const status of ARCHIVE_STATUS_ORDER) buckets.set(status, []);
  for (const item of sortDecisions(decisions)) {
    buckets.get(decisionArchiveStatus(item))?.push(item);
  }
  return ARCHIVE_STATUS_ORDER.map((status) => ({
    status,
    label: ARCHIVE_STATUS_LABEL[status],
    items: buckets.get(status) ?? [],
  })).filter((group) => group.items.length > 0);
}

export function groupDecisionsByDate(
  decisions: Decision[],
): DecisionDateFolder[] {
  const buckets = new Map<string, Decision[]>();
  for (const item of decisions) {
    const key = decisionFolderKey(item);
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }

  return Array.from(buckets.entries())
    .map(([key, items]) => {
      const sorted = sortDecisions(items);
      return {
        key,
        label: key === UNDATED_FOLDER_KEY ? "Undated" : key,
        count: sorted.length,
        items: sorted,
        groups: groupDecisionsByArchiveStatus(sorted),
      };
    })
    .sort((a, b) => {
      if (a.key === UNDATED_FOLDER_KEY) return 1;
      if (b.key === UNDATED_FOLDER_KEY) return -1;
      return b.key.localeCompare(a.key);
    });
}

export function findDateFolder(
  decisions: Decision[],
  folderKey: string,
): DecisionDateFolder | null {
  const key = folderKey.trim() || UNDATED_FOLDER_KEY;
  return groupDecisionsByDate(decisions).find((folder) => folder.key === key) ?? null;
}

export function decisionDetailHref(id: string): string {
  return `/decisions/${encodeURIComponent(id)}`;
}

export function decisionsArchiveHref(folderKey?: string | null): string {
  if (!folderKey) return "/decisions";
  const params = new URLSearchParams({ folder: folderKey });
  return `/decisions?${params.toString()}`;
}

export function decisionsTabHref(tab: "archive" | "todos" | "new"): string {
  if (tab === "archive") return "/decisions";
  return `/decisions?tab=${tab}`;
}

export function folderSummary(folder: DecisionDateFolder): string {
  return folder.groups
    .map((group) => `${group.items.length} ${group.label.toLowerCase()}`)
    .join(" · ");
}
