import "server-only";

import { GITHUB_REPO, GITHUB_REVALIDATE_SECONDS, type GithubPull } from "@/lib/build-tracker";

export type GithubPullLoad = {
  pulls: GithubPull[];
  fresh: boolean;
};

type Loader = (numbers: readonly number[]) => Promise<GithubPullLoad>;

const MEMORY_MS = GITHUB_REVALIDATE_SECONDS * 1000;

let memory: { expiresAt: number; pulls: GithubPull[] } | null = null;
let limitedUntil = 0;
let loaderOverride: Loader | null = null;
let cachedList: (() => Promise<GithubPull[]>) | null = null;

export function setGithubPullLoaderForTests(loader: Loader | null): void {
  loaderOverride = loader;
  memory = null;
  limitedUntil = 0;
  cachedList = null;
}

export function githubRequestInit(headers: Headers): RequestInit & { next: { revalidate: number } } {
  return {
    headers,
    signal: AbortSignal.timeout(4000),
    next: { revalidate: GITHUB_REVALIDATE_SECONDS },
  };
}

function githubHeaders(): Headers {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "resonance-build-tracker",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export function parseGithubPull(value: unknown): GithubPull | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.number !== "number" || !Number.isInteger(row.number)) return null;
  if (row.state !== "open" && row.state !== "closed") return null;
  const labels = Array.isArray(row.labels)
    ? row.labels.flatMap((label) => {
        if (!label || typeof label !== "object") return [];
        const name = (label as { name?: unknown }).name;
        return typeof name === "string" ? [name] : [];
      })
    : [];
  const head = row.head;
  const headRef =
    head && typeof head === "object" && typeof (head as { ref?: unknown }).ref === "string"
      ? (head as { ref: string }).ref
      : "";
  return {
    number: row.number,
    state: row.state,
    mergedAt: typeof row.merged_at === "string" && row.merged_at ? row.merged_at : null,
    title: typeof row.title === "string" ? row.title : "",
    body: typeof row.body === "string" ? row.body : "",
    labels,
    headRef,
  };
}

function isRateLimited(status: number): boolean {
  return status === 403 || status === 429;
}

async function fetchPullPage(): Promise<GithubPull[]> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/pulls?state=all&per_page=100&sort=updated&direction=desc`;
  const response = await fetch(url, githubRequestInit(githubHeaders()));
  if (isRateLimited(response.status) || !response.ok) {
    throw new Error("GitHub pull list is unavailable.");
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) return [];
  return body.flatMap((row) => {
    const pull = parseGithubPull(row);
    return pull ? [pull] : [];
  });
}

async function fetchOnePull(number: number): Promise<GithubPull | null | "stop"> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/pulls/${number}`;
  try {
    const response = await fetch(url, githubRequestInit(githubHeaders()));
    if (isRateLimited(response.status)) return "stop";
    if (response.status === 404) return null;
    if (!response.ok) return null;
    return parseGithubPull(await response.json());
  } catch {
    return "stop";
  }
}

async function listPullsCached(): Promise<GithubPull[]> {
  if (!cachedList) {
    const { unstable_cache } = await import("next/cache");
    cachedList = unstable_cache(fetchPullPage, ["resonance-build-tracker-pulls"], {
      revalidate: GITHUB_REVALIDATE_SECONDS,
    });
  }
  return cachedList();
}

/**
 * Public GitHub REST for this repo. Successful lists stay cached for about
 * 10 minutes. A rate limit or network failure returns fresh: false so the
 * caller keeps the last stored steps. The token never leaves this module.
 */
export async function loadGithubPulls(wantedNumbers: readonly number[] = []): Promise<GithubPullLoad> {
  if (loaderOverride) return loaderOverride(wantedNumbers);
  const now = Date.now();
  if (memory && memory.expiresAt > now) return { pulls: memory.pulls, fresh: true };
  if (limitedUntil > now) return { pulls: memory?.pulls ?? [], fresh: false };
  try {
    const listed = await listPullsCached();
    const have = new Set(listed.map((pull) => pull.number));
    const extra: GithubPull[] = [];
    for (const number of wantedNumbers) {
      if (have.has(number)) continue;
      const one = await fetchOnePull(number);
      if (one === "stop") break;
      if (one) extra.push(one);
    }
    const pulls = listed.concat(extra);
    memory = { expiresAt: now + MEMORY_MS, pulls };
    return { pulls, fresh: true };
  } catch {
    limitedUntil = now + MEMORY_MS;
    return { pulls: memory?.pulls ?? [], fresh: false };
  }
}
