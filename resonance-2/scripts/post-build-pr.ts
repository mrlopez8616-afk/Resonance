import { readFileSync } from "node:fs";
import { buildPrCalendarBody } from "../src/lib/calendar-writers";
import { postCalendarEvent } from "./post-calendar-event";

/**
 * Build writer for GitHub pull_request events.
 * Reads GITHUB_EVENT_PATH. Id is build-pr-<number>. A later event updates that row.
 */
type PullPayload = {
  action?: string;
  pull_request?: {
    number?: number;
    title?: string;
    html_url?: string;
    created_at?: string;
    merged?: boolean;
  };
};

async function main(): Promise<void> {
  const path = process.env.GITHUB_EVENT_PATH?.trim();
  if (!path) throw new Error("GITHUB_EVENT_PATH is required.");
  const payload = JSON.parse(readFileSync(path, "utf8")) as PullPayload;
  const pull = payload.pull_request;
  if (!pull?.number || !pull.created_at || !pull.html_url) {
    throw new Error("pull_request payload is missing number, created_at, or html_url.");
  }
  const event = buildPrCalendarBody({
    number: pull.number,
    title: pull.title ?? "",
    htmlUrl: pull.html_url,
    createdAt: pull.created_at,
    action: payload.action ?? "",
    merged: Boolean(pull.merged),
  });
  await postCalendarEvent(event);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
