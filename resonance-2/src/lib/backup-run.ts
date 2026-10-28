import "server-only";

import {
  backupGithubTarget,
  runBackup,
  secretValues,
  type BackupRunResult,
} from "@/lib/backup";
import { readLiveBlobsFromStore } from "@/lib/backup-blobs";
import { createGithubBackupStore } from "@/lib/backup-github";
import { getSql } from "@/lib/pg/client";

export class BackupConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupConfigError";
  }
}

let runnerOverride: ((now: Date) => Promise<BackupRunResult>) | null = null;

export function setBackupRunnerForTests(runner: ((now: Date) => Promise<BackupRunResult>) | null): void {
  runnerOverride = runner;
}

export async function runNightlyBackup(now = new Date()): Promise<BackupRunResult> {
  if (runnerOverride) return runnerOverride(now);
  const target = backupGithubTarget(process.env);
  if (!target) throw new BackupConfigError("Backup GitHub destination is not configured.");
  const sql = await getSql();
  return runBackup({
    now,
    sql,
    blobs: readLiveBlobsFromStore,
    github: createGithubBackupStore({
      token: target.token,
      owner: target.owner,
      name: target.name,
      branch: target.branch,
    }),
    target: { repo: target.repo, branch: target.branch },
    secrets: secretValues(process.env),
  });
}
