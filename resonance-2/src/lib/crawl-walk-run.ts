import rawSeed from "../../cabinet/crawl-walk-run-seed.json";
import { hasMoneyText, publicTextLeaks } from "@/lib/public-mode";

/**
 * Crawl Walk Run. A versioned seed, read by the floor.
 * No table. No migration. Stages come from the seed, which is written
 * from what the repo shows. Uncertain rows stay at the earlier stage.
 * The copy has no money figures.
 */

export const CWR_HREF = "/n/crawl-walk-run";
export const CWR_BUILD_HREF = "/n/build";

export const CWR_STAGES = ["crawl", "walk", "run"] as const;
export type CwrStage = (typeof CWR_STAGES)[number];

export const CWR_GROUPS = ["built", "planned", "recommended"] as const;
export type CwrGroupId = (typeof CWR_GROUPS)[number];

export const CWR_CONFIDENCE = ["recorded", "conservative"] as const;
export type CwrConfidence = (typeof CWR_CONFIDENCE)[number];

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STATUS_LINE_MAX = 96;

export type CwrPhase = {
  id: string;
  to: CwrStage;
  label: string;
  line: string;
};

export type CwrItem = {
  id: string;
  group: CwrGroupId;
  title: string;
  glyph: string;
  stage: CwrStage;
  stageMet: boolean;
  confidence: CwrConfidence;
  statusLine: string;
  sort: number;
  crawl: string;
  walk: string;
  run: string;
  more: string;
  phases: CwrPhase[];
  evidence: string;
  sources: string[];
};

export type CwrGroup = {
  id: CwrGroupId;
  label: string;
  blurb: string;
};

export type CwrSeed = {
  version: number;
  updated: string;
  groups: CwrGroup[];
  items: CwrItem[];
};

export type CwrParse = { ok: true; value: CwrSeed } | { ok: false; errors: string[] };

type PhaseView = CwrPhase & { next: boolean };

export type CwrDetail = {
  item: CwrItem;
  group: CwrGroup;
  stageLabel: string;
  headline: string;
  next: CwrPhase | null;
  phases: PhaseView[];
  stages: { id: CwrStage; label: string; text: string; current: boolean }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(errors: string[], message: string): void {
  errors.push(message);
}

function isStage(value: string): value is CwrStage {
  return (CWR_STAGES as readonly string[]).includes(value);
}

function isGroup(value: string): value is CwrGroupId {
  return (CWR_GROUPS as readonly string[]).includes(value);
}

function isConfidence(value: string): value is CwrConfidence {
  return (CWR_CONFIDENCE as readonly string[]).includes(value);
}

/** Public copy. A dollar sign, a money phrase, or a holdings word is rejected. */
export function crawlWalkRunTextLeak(value: string): string | null {
  if (value.includes("$")) return "dollar sign";
  if (hasMoneyText(value)) return "money text";
  const leaks = publicTextLeaks(value);
  return leaks.length > 0 ? leaks.join(",") : null;
}

function readText(errors: string[], where: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(errors, `${where} is empty`);
    return "";
  }
  const text = value.trim();
  const leak = crawlWalkRunTextLeak(text);
  if (leak) fail(errors, `${where} leaks ${leak}`);
  return text;
}

function nextStage(stage: CwrStage): CwrStage | null {
  const index = CWR_STAGES.indexOf(stage);
  return CWR_STAGES[index + 1] ?? null;
}

export function stageLabel(stage: CwrStage): string {
  if (stage === "crawl") return "Crawl";
  if (stage === "walk") return "Walk";
  return "Run";
}

export function parseCrawlWalkRun(value: unknown): CwrParse {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["seed is not an object"] };
  if (value.version !== 1) fail(errors, "version must be 1");
  readText(errors, "updated", value.updated);
  if (!Array.isArray(value.groups)) fail(errors, "groups missing");
  if (!Array.isArray(value.items)) fail(errors, "items missing");
  if (errors.length > 0) return { ok: false, errors };

  const groups: CwrGroup[] = [];
  const seenGroups = new Set<string>();
  for (const entry of value.groups as unknown[]) {
    if (!isRecord(entry)) {
      fail(errors, "group is not an object");
      continue;
    }
    const id = typeof entry.id === "string" ? entry.id : "";
    if (!isGroup(id)) fail(errors, `unknown group ${id || "(blank)"}`);
    if (seenGroups.has(id)) fail(errors, `duplicate group ${id}`);
    seenGroups.add(id);
    groups.push({
      id: isGroup(id) ? id : "built",
      label: readText(errors, `${id} label`, entry.label),
      blurb: readText(errors, `${id} blurb`, entry.blurb),
    });
  }
  for (const id of CWR_GROUPS) {
    if (!seenGroups.has(id)) fail(errors, `missing group ${id}`);
  }

  const items: CwrItem[] = [];
  const seenItems = new Set<string>();
  for (const entry of value.items as unknown[]) {
    if (!isRecord(entry)) {
      fail(errors, "item is not an object");
      continue;
    }
    const id = typeof entry.id === "string" ? entry.id : "";
    const where = id || "(blank item)";
    if (!ID.test(id)) fail(errors, `${where} id is not a slug`);
    if (seenItems.has(id)) fail(errors, `duplicate item ${id}`);
    seenItems.add(id);
    const group = typeof entry.group === "string" ? entry.group : "";
    if (!isGroup(group)) fail(errors, `${where} group is unknown`);
    const stage = typeof entry.stage === "string" ? entry.stage : "";
    if (!isStage(stage)) fail(errors, `${where} stage is unknown`);
    if (typeof entry.stageMet !== "boolean") fail(errors, `${where} stageMet is missing`);
    const stageMet = entry.stageMet === true;
    const stageId: CwrStage = isStage(stage) ? stage : "crawl";
    if (!stageMet && stageId !== "crawl") fail(errors, `${where} is not started and is past Crawl`);
    const confidence = typeof entry.confidence === "string" ? entry.confidence : "";
    if (!isConfidence(confidence)) fail(errors, `${where} confidence is unknown`);
    if (stageId === "run" && confidence === "conservative") {
      fail(errors, `${where} claims Run on a conservative read`);
    }
    const statusLine = readText(errors, `${where} status`, entry.statusLine);
    if (statusLine.length > STATUS_LINE_MAX) fail(errors, `${where} status is too long`);
    if (typeof entry.sort !== "number" || !Number.isInteger(entry.sort)) fail(errors, `${where} sort is missing`);
    const phases: CwrPhase[] = [];
    if (!Array.isArray(entry.phases) || entry.phases.length === 0) fail(errors, `${where} has no phase lines`);
    const seenPhases = new Set<string>();
    for (const phase of Array.isArray(entry.phases) ? entry.phases : []) {
      if (!isRecord(phase)) {
        fail(errors, `${where} phase is not an object`);
        continue;
      }
      const phaseId = typeof phase.id === "string" ? phase.id : "";
      if (!ID.test(phaseId)) fail(errors, `${where} phase id is not a slug`);
      if (seenPhases.has(phaseId)) fail(errors, `${where} duplicate phase ${phaseId}`);
      seenPhases.add(phaseId);
      const to = typeof phase.to === "string" ? phase.to : "";
      if (!isStage(to)) fail(errors, `${where} phase ${phaseId} target is unknown`);
      phases.push({
        id: phaseId,
        to: isStage(to) ? to : "crawl",
        label: readText(errors, `${where} ${phaseId} label`, phase.label),
        line: readText(errors, `${where} ${phaseId} line`, phase.line),
      });
    }
    if (stageMet) {
      const upcoming = nextStage(stageId);
      if (upcoming && !phases.some((phase) => phase.to === upcoming)) {
        fail(errors, `${where} has no phase line into ${stageLabel(upcoming)}`);
      }
    } else if (!phases.some((phase) => phase.to === "crawl")) {
      fail(errors, `${where} has no phase line into Crawl`);
    }
    const sources = Array.isArray(entry.sources)
      ? entry.sources.filter((source): source is string => typeof source === "string" && source.trim().length > 0)
      : [];
    if (sources.length === 0) fail(errors, `${where} has no source`);
    for (const source of sources) {
      const leak = crawlWalkRunTextLeak(source);
      if (leak) fail(errors, `${where} source leaks ${leak}`);
    }
    items.push({
      id,
      group: isGroup(group) ? group : "built",
      title: readText(errors, `${where} title`, entry.title),
      glyph: readText(errors, `${where} glyph`, entry.glyph),
      stage: stageId,
      stageMet,
      confidence: isConfidence(confidence) ? confidence : "conservative",
      statusLine,
      sort: typeof entry.sort === "number" ? entry.sort : 0,
      crawl: readText(errors, `${where} crawl`, entry.crawl),
      walk: readText(errors, `${where} walk`, entry.walk),
      run: readText(errors, `${where} run`, entry.run),
      more: readText(errors, `${where} more`, entry.more),
      phases,
      evidence: readText(errors, `${where} evidence`, entry.evidence),
      sources,
    });
  }

  for (const id of CWR_GROUPS) {
    if (!items.some((item) => item.group === id)) fail(errors, `${id} has no items`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      version: 1,
      updated: String(value.updated).trim(),
      groups: CWR_GROUPS.map((id) => groups.find((group) => group.id === id)!),
      items,
    },
  };
}

const parsed = parseCrawlWalkRun(rawSeed);
if (!parsed.ok) {
  throw new Error(`crawl-walk-run seed\n${parsed.errors.join("\n")}`);
}

export const CRAWL_WALK_RUN: CwrSeed = parsed.value;

export function groupHref(id: string): string {
  return `${CWR_HREF}/${id}`;
}

export function itemHref(group: string, id: string): string {
  return `${CWR_HREF}/${group}/${id}`;
}

export function cwrGroup(id: string): CwrGroup | null {
  return CRAWL_WALK_RUN.groups.find((group) => group.id === id) ?? null;
}

export function cwrItems(group: CwrGroupId): CwrItem[] {
  return CRAWL_WALK_RUN.items
    .filter((item) => item.group === group)
    .slice()
    .sort((left, right) => left.sort - right.sort || left.title.localeCompare(right.title));
}

export function cwrItem(group: CwrGroupId, id: string): CwrItem | null {
  return cwrItems(group).find((item) => item.id === id) ?? null;
}

export function cwrGroupLabel(id: string): string | null {
  return cwrGroup(id)?.label ?? null;
}

export function cwrItemLabel(group: string, id: string): string | null {
  if (!isGroup(group)) return null;
  return cwrItem(group, id)?.title ?? null;
}

export function stageHeadline(item: Pick<CwrItem, "stage" | "stageMet">): string {
  return item.stageMet ? stageLabel(item.stage) : "Not started";
}

/** The threshold still in front of this item. Null once Run is met. */
export function openPhase(item: CwrItem): CwrPhase | null {
  if (!item.stageMet) return item.phases.find((phase) => phase.to === item.stage) ?? null;
  const upcoming = nextStage(item.stage);
  if (!upcoming) return null;
  return item.phases.find((phase) => phase.to === upcoming) ?? null;
}

function countLine(count: number, label: string): string | null {
  if (count === 0) return null;
  return `${count} ${label}`;
}

export function groupStatus(items: readonly CwrItem[]): string {
  const parts = [
    countLine(items.filter((item) => item.stageMet && item.stage === "crawl").length, "Crawl"),
    countLine(items.filter((item) => item.stageMet && item.stage === "walk").length, "Walk"),
    countLine(items.filter((item) => item.stageMet && item.stage === "run").length, "Run"),
    countLine(items.filter((item) => !item.stageMet).length, "not started"),
  ].filter((part): part is string => part !== null);
  return parts.join(" · ");
}

export function cwrDetail(groupId: CwrGroupId, id: string): CwrDetail | null {
  const group = cwrGroup(groupId);
  const item = cwrItem(groupId, id);
  if (!group || !item) return null;
  const next = openPhase(item);
  return {
    item,
    group,
    stageLabel: stageLabel(item.stage),
    headline: stageHeadline(item),
    next,
    phases: item.phases.map((phase) => ({ ...phase, next: phase.id === next?.id })),
    stages: [
      { id: "crawl", label: "Crawl", text: item.crawl, current: item.stageMet && item.stage === "crawl" },
      { id: "walk", label: "Walk", text: item.walk, current: item.stageMet && item.stage === "walk" },
      { id: "run", label: "Run", text: item.run, current: item.stageMet && item.stage === "run" },
    ],
  };
}

/** One status line for the Build card: how many items sit in each group. */
export function cwrBuildStatus(): { headline: string; status: string } {
  const parts = CRAWL_WALK_RUN.groups.map((group) => `${cwrItems(group.id).length} ${group.label.toLowerCase()}`);
  return {
    headline: String(CRAWL_WALK_RUN.items.length),
    status: parts.join(" · "),
  };
}
