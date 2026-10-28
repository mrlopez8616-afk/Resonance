import "server-only";

import { isSnapshotPath, scrubSecretText, type GithubBackupStore } from "@/lib/backup";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type TreeEntry = { path: string; sha: string | null };

/**
 * One commit per night on the private backup branch.
 * Writes and deletes are limited to snapshots/YYYY-MM-DD.json.
 */
export function createGithubBackupStore(options: {
  token: string;
  owner: string;
  name: string;
  branch: string;
  fetchImpl?: FetchLike;
}): GithubBackupStore {
  const fetchImpl = options.fetchImpl ?? fetch;
  const root = `/repos/${options.owner}/${options.name}`;
  const refName = `heads/${options.branch}`;
  const secrets = [options.token];

  async function request(path: string, init: RequestInit = {}, allow404 = false): Promise<unknown> {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
        "User-Agent": "resonance-backup",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (allow404 && response.status === 404) return null;
    const text = await response.text();
    if (!response.ok) {
      throw new Error(scrubSecretText(text || `GitHub returned ${response.status}.`, secrets).slice(0, 240));
    }
    if (!text) return null;
    return JSON.parse(text) as unknown;
  }

  function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  }

  async function refSha(): Promise<string | null> {
    const body = await request(`${root}/git/ref/${refName}`, {}, true);
    if (!body) return null;
    const sha = asRecord(asRecord(body).object).sha;
    if (typeof sha !== "string" || !sha) throw new Error("GitHub ref had no commit.");
    return sha;
  }

  async function treePaths(commitSha: string): Promise<string[]> {
    const commit = asRecord(await request(`${root}/git/commits/${commitSha}`));
    const treeSha = asRecord(commit.tree).sha;
    if (typeof treeSha !== "string" || !treeSha) throw new Error("GitHub commit had no tree.");
    const tree = asRecord(await request(`${root}/git/trees/${treeSha}?recursive=1`));
    if (tree.truncated === true) throw new Error("GitHub tree was truncated. Refusing to prune.");
    const entries = Array.isArray(tree.tree) ? tree.tree : [];
    const paths: string[] = [];
    for (const entry of entries) {
      const row = asRecord(entry);
      if (row.type === "blob" && typeof row.path === "string") paths.push(row.path);
    }
    return paths;
  }

  return {
    async listSnapshotPaths() {
      const sha = await refSha();
      if (!sha) return [];
      return treePaths(sha);
    },
    async commit({ message, writes, deletes }) {
      for (const file of writes) {
        if (!isSnapshotPath(file.path)) throw new Error("refusing to write outside the snapshot folder");
      }
      for (const path of deletes) {
        if (!isSnapshotPath(path)) throw new Error("refusing to delete outside the snapshot folder");
      }
      const parent = await refSha();
      let baseTree: string | null = null;
      if (parent) {
        const commit = asRecord(await request(`${root}/git/commits/${parent}`));
        const treeSha = asRecord(commit.tree).sha;
        if (typeof treeSha !== "string" || !treeSha) throw new Error("GitHub commit had no tree.");
        baseTree = treeSha;
      }
      const entries: TreeEntry[] = [];
      for (const file of writes) {
        const blob = asRecord(
          await request(`${root}/git/blobs`, {
            method: "POST",
            body: JSON.stringify({
              content: Buffer.from(file.content, "utf8").toString("base64"),
              encoding: "base64",
            }),
          }),
        );
        if (typeof blob.sha !== "string" || !blob.sha) throw new Error("GitHub blob had no sha.");
        entries.push({ path: file.path, sha: blob.sha });
      }
      for (const path of deletes) entries.push({ path, sha: null });
      const treeBody: { base_tree?: string; tree: { path: string; mode: string; type: string; sha: string | null }[] } = {
        tree: entries.map((entry) => ({
          path: entry.path,
          mode: "100644",
          type: "blob",
          sha: entry.sha,
        })),
      };
      if (baseTree) treeBody.base_tree = baseTree;
      const tree = asRecord(
        await request(`${root}/git/trees`, {
          method: "POST",
          body: JSON.stringify(treeBody),
        }),
      );
      if (typeof tree.sha !== "string" || !tree.sha) throw new Error("GitHub tree had no sha.");
      const created = asRecord(
        await request(`${root}/git/commits`, {
          method: "POST",
          body: JSON.stringify({
            message,
            tree: tree.sha,
            parents: parent ? [parent] : [],
          }),
        }),
      );
      if (typeof created.sha !== "string" || !created.sha) throw new Error("GitHub commit had no sha.");
      if (parent) {
        await request(`${root}/git/refs/${refName}`, {
          method: "PATCH",
          body: JSON.stringify({ sha: created.sha }),
        });
      } else {
        await request(`${root}/git/refs`, {
          method: "POST",
          body: JSON.stringify({ ref: `refs/heads/${options.branch}`, sha: created.sha }),
        });
      }
      return { commitSha: created.sha };
    },
  };
}
