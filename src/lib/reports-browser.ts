import { isIsoDayKey, sortReports, type OperatorReport, type ReportKind } from "./reports";

export const UNDATED_REPORT_FOLDER = "undated";

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  brief: "Brief",
  "rh-ops": "RH ops",
  build: "Build",
  other: "Other",
};

export interface ReportDateFolder {
  key: string;
  label: string;
  count: number;
  items: OperatorReport[];
}

export function reportFolderKey(report: OperatorReport): string {
  return isIsoDayKey(report.createdAt) ? report.createdAt : UNDATED_REPORT_FOLDER;
}

export function groupReportsByDate(reports: OperatorReport[]): ReportDateFolder[] {
  const buckets = new Map<string, OperatorReport[]>();
  for (const item of reports) {
    const key = reportFolderKey(item);
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }

  return Array.from(buckets.entries())
    .map(([key, items]) => {
      const sorted = sortReports(items);
      return {
        key,
        label: key === UNDATED_REPORT_FOLDER ? "Undated" : key,
        count: sorted.length,
        items: sorted,
      };
    })
    .sort((a, b) => {
      if (a.key === UNDATED_REPORT_FOLDER) return 1;
      if (b.key === UNDATED_REPORT_FOLDER) return -1;
      return b.key.localeCompare(a.key);
    });
}

export function findReportDateFolder(
  reports: OperatorReport[],
  folderKey: string,
): ReportDateFolder | null {
  const key = folderKey.trim() || UNDATED_REPORT_FOLDER;
  return groupReportsByDate(reports).find((folder) => folder.key === key) ?? null;
}

export function reportDetailHref(id: string): string {
  return `/reports/${encodeURIComponent(id)}`;
}

export function reportsArchiveHref(folderKey?: string | null): string {
  if (!folderKey) return "/reports";
  return `/archive/${encodeURIComponent(folderKey)}`;
}

export function reportsFolderHref(folderKey?: string | null): string {
  if (!folderKey) return "/reports";
  const params = new URLSearchParams({ folder: folderKey });
  return `/reports?${params.toString()}`;
}

export function folderFileSummary(folder: ReportDateFolder): string {
  const counts = new Map<ReportKind, number>();
  for (const item of folder.items) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([kind, count]) => `${count} ${REPORT_KIND_LABEL[kind].toLowerCase()}`)
    .join(" · ");
}
