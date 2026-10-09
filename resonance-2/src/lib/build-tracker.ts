/**
 * Build tracker math. Percent is the share of concrete checklist steps
 * that are done. An item with no steps has no percent.
 */

export const BUILD_NODES = [
  "platform",
  "crypto",
  "ai-stocks",
  "fitness",
  "finance",
  "fight-desk",
  "youtube",
] as const;

export type BuildNode = (typeof BUILD_NODES)[number];

export const BUILD_NODE_LABELS: Record<BuildNode, string> = {
  platform: "Platform",
  crypto: "Crypto",
  "ai-stocks": "AI Stocks",
  fitness: "Fitness",
  finance: "Finance",
  "fight-desk": "Fight Desk",
  youtube: "YouTube",
};

export const BUILD_STATUSES = ["live", "in_progress", "queued", "blocked"] as const;

export type BuildStatus = (typeof BUILD_STATUSES)[number];

export type BuildStep = {
  id: string;
  label: string;
  done: boolean;
};

export const STANDARD_STEP_DEFS = [
  { id: "spec", label: "spec written" },
  { id: "pr-open", label: "PR open" },
  { id: "tests-build", label: "local tests and build pass" },
  { id: "merged", label: "merged" },
  { id: "verified-prod", label: "verified on prod" },
] as const;

export const GITHUB_REPO = "mrlopez8616-afk/Resonance";
export const GITHUB_REVALIDATE_SECONDS = 600;
export const SHIPPED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const TESTS_PASSED = /local tests and build passed/i;

export type GithubPull = {
  number: number;
  state: "open" | "closed";
  mergedAt: string | null;
  title: string;
  body: string;
  labels: string[];
  headRef: string;
};

export type BuildItem = {
  id: string;
  title: string;
  node: BuildNode;
  prNumber: number | null;
  status: BuildStatus;
  steps: BuildStep[];
  nextStep: string | null;
  sortOrder: number;
  updatedAt: string;
};

export type BuildGroup = {
  node: BuildNode;
  label: string;
  percent: number | null;
  active: BuildItem[];
  shipped: BuildItem[];
};

export type BuildBoard = {
  totalPercent: number | null;
  groups: BuildGroup[];
  githubFresh: boolean;
};

export type BuildHomeCard = {
  unavailable: boolean;
  percentLabel: string | null;
  lines: string[];
};

export function isBuildNode(value: string): value is BuildNode {
  return (BUILD_NODES as readonly string[]).includes(value);
}

export function isBuildStatus(value: string): value is BuildStatus {
  return (BUILD_STATUSES as readonly string[]).includes(value);
}

export function standardSteps(done: Readonly<Record<string, boolean>> = {}): BuildStep[] {
  return STANDARD_STEP_DEFS.map((step) => ({
    id: step.id,
    label: step.label,
    done: done[step.id] === true,
  }));
}

export function parseSteps(value: unknown): BuildStep[] {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const steps: BuildStep[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.label !== "string") continue;
    const id = row.id.trim();
    const label = row.label.trim();
    if (!id || !label) continue;
    steps.push({ id, label, done: row.done === true });
  }
  return steps;
}

/** Null when there are no steps. Each step is an equal share of 100. */
export function stepPercent(steps: readonly { done: boolean }[]): number | null {
  if (steps.length === 0) return null;
  const done = steps.filter((step) => step.done).length;
  return Math.round((done / steps.length) * 100);
}

export function stepCounts(steps: readonly { done: boolean }[]): { done: number; total: number } {
  return {
    done: steps.filter((step) => step.done).length,
    total: steps.length,
  };
}

/** Average of each item's exact step share, rounded once. Items with no steps are left out. */
export function averageStepPercent(items: readonly { steps: readonly { done: boolean }[] }[]): number | null {
  const ratios: number[] = [];
  for (const item of items) {
    if (item.steps.length === 0) continue;
    const done = item.steps.filter((step) => step.done).length;
    ratios.push(done / item.steps.length);
  }
  if (ratios.length === 0) return null;
  const mean = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
  return Math.round(mean * 100);
}

export function pullSaysTestsPassed(pull: Pick<GithubPull, "body" | "labels">): boolean {
  if (TESTS_PASSED.test(pull.body)) return true;
  return pull.labels.some((label) => TESTS_PASSED.test(label));
}

/**
 * PR open means a pull request exists (open, merged, or closed without merge).
 * Merged means GitHub set merged_at. Tests flip on only when the body or a
 * label says local tests and build passed. Verified on prod stays as stored.
 */
export function applyPullToSteps(steps: readonly BuildStep[], pull: GithubPull | null): BuildStep[] {
  if (!pull) return steps.map((step) => ({ ...step }));
  const merged = typeof pull.mergedAt === "string" && pull.mergedAt.length > 0;
  const testsPassed = pullSaysTestsPassed(pull);
  return steps.map((step) => {
    if (step.id === "pr-open") return { ...step, done: true };
    if (step.id === "merged") return { ...step, done: merged };
    if (step.id === "tests-build" && testsPassed) return { ...step, done: true };
    return { ...step };
  });
}

const TITLE_MATCHERS: Record<string, (pull: GithubPull) => boolean> = {
  "platform-fills-dedupe": (pull) =>
    /fills dedupe/i.test(pull.title) ||
    /lots totals across sleeves/i.test(pull.title) ||
    /fills-dedupe|lots-dedupe|dedupe-fills/i.test(pull.headRef),
  "platform-pwa": (pull) =>
    /installable iphone app/i.test(pull.title) ||
    /\(pwa\)/i.test(pull.title) ||
    /service-worker|installable-pwa/i.test(pull.headRef),
  "platform-build-tracker": (pull) =>
    /build tracker/i.test(pull.title) || /build-tracker/i.test(pull.headRef),
};

function pickPull(hits: readonly GithubPull[]): GithubPull | null {
  if (hits.length === 0) return null;
  const open = hits.filter((pull) => pull.state === "open" && !pull.mergedAt);
  const pool = open.length > 0 ? open : hits;
  return pool.reduce((best, pull) => (pull.number > best.number ? pull : best));
}

export function pullForItem(
  item: { id: string; prNumber: number | null },
  pulls: readonly GithubPull[],
): GithubPull | null {
  if (item.prNumber != null) {
    return pulls.find((pull) => pull.number === item.prNumber) ?? null;
  }
  const match = TITLE_MATCHERS[item.id];
  if (!match) return null;
  return pickPull(pulls.filter(match));
}

export function overlayPulls(items: readonly BuildItem[], pulls: readonly GithubPull[]): BuildItem[] {
  return items.map((item) => {
    const pull = pullForItem(item, pulls);
    if (!pull) return item;
    const steps = applyPullToSteps(item.steps, pull);
    const prNumber = item.prNumber ?? pull.number;
    return { ...item, steps, prNumber };
  });
}

export function isShippedLive(item: { status: string; updatedAt: string }, now: Date): boolean {
  if (item.status !== "live") return false;
  const updated = new Date(item.updatedAt).getTime();
  if (Number.isNaN(updated)) return false;
  return now.getTime() - updated > SHIPPED_AFTER_MS;
}

function bySort(left: BuildItem, right: BuildItem): number {
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  return left.title.localeCompare(right.title);
}

export function groupBuildItems(items: readonly BuildItem[], now: Date): {
  totalPercent: number | null;
  groups: BuildGroup[];
} {
  const groups = BUILD_NODES.flatMap((node) => {
    const rows = items.filter((item) => item.node === node).slice().sort(bySort);
    if (rows.length === 0) return [];
    return [
      {
        node,
        label: BUILD_NODE_LABELS[node],
        percent: averageStepPercent(rows),
        active: rows.filter((item) => !isShippedLive(item, now)),
        shipped: rows.filter((item) => isShippedLive(item, now)),
      },
    ];
  });
  return { totalPercent: averageStepPercent(items), groups };
}

export function buildHomeCard(items: readonly BuildItem[]): BuildHomeCard {
  const percent = averageStepPercent(items);
  const lines: string[] = [];
  const inProgress = items.filter((item) => item.status === "in_progress").length;
  if (inProgress === 1) lines.push("1 in progress");
  else if (inProgress > 1) lines.push(`${inProgress} in progress`);
  const nextQueued = items.filter((item) => item.status === "queued").slice().sort(bySort)[0];
  if (nextQueued && lines.length < 2) lines.push(`Next: ${nextQueued.title}`);
  return {
    unavailable: false,
    percentLabel: percent === null ? null : `${percent}%`,
    lines,
  };
}

export function statusLabel(status: BuildStatus): string {
  if (status === "in_progress") return "in progress";
  return status;
}

export function pullHref(prNumber: number): string {
  return `https://github.com/${GITHUB_REPO}/pull/${prNumber}`;
}

export function formatUpdatedCt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function mergeSteps(existing: readonly BuildStep[], patch: readonly BuildStep[]): BuildStep[] {
  const next = existing.map((step) => ({ ...step }));
  for (const update of patch) {
    const found = next.find((step) => step.id === update.id);
    if (found) {
      found.done = update.done;
      if (update.label.trim()) found.label = update.label.trim();
      continue;
    }
    const label = update.label.trim();
    if (!label) continue;
    next.push({ id: update.id, label, done: update.done });
  }
  return next;
}

export function buildItemId(node: string, title: string): string {
  const slug = `${node}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "build-item";
}

export function sameSteps(left: readonly BuildStep[], right: readonly BuildStep[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
