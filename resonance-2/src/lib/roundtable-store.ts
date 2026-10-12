import "server-only";

import { randomBytes } from "node:crypto";
import { sqlQuery, sqlTransaction } from "@/lib/pg/client";
import {
  isRoundtableId,
  presentRoundtableCards,
  presentRoundtableThread,
  roundtableHomeModel,
  type AgentPost,
  type FounderReply,
  type RoundtableAudience,
  type RoundtableCard,
  type RoundtableHomeModel,
  type RoundtableMessage,
  type RoundtableThread,
  type RoundtableThreadSummary,
  type RoundtableThreadView,
} from "@/lib/roundtable";

type ThreadRow = {
  id: string;
  agent_id: string;
  title: string;
  audience: string;
  created_at: string | Date;
  updated_at: string | Date;
  message_count?: string | number | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  author_kind: string;
  author_id: string;
  body: string;
  created_at: string | Date;
};

export type RoundtableWrite =
  | { ok: true; created: boolean; thread: RoundtableThread; message: RoundtableMessage }
  | { ok: false; status: number; error: string };

const THREADS_SQL = `SELECT t.id, t.agent_id, t.title, t.audience, t.created_at, t.updated_at,
  count(m.id)::text AS message_count
  FROM roundtable_threads t
  LEFT JOIN roundtable_messages m ON m.thread_id = t.id
  WHERE t.audience = 'founder'
  GROUP BY t.id
  ORDER BY t.updated_at DESC, t.id`;

const THREAD_SQL = `SELECT id, agent_id, title, audience, created_at, updated_at
  FROM roundtable_threads WHERE id = $1`;

const MESSAGES_SQL = `SELECT id, thread_id, author_kind, author_id, body, created_at
  FROM roundtable_messages
  WHERE thread_id = $1
  ORDER BY created_at ASC, id ASC`;

const MESSAGE_SQL = `SELECT id, thread_id, author_kind, author_id, body, created_at
  FROM roundtable_messages WHERE id = $1`;

function asIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date(0).toISOString();
  return date.toISOString();
}

function asAudience(value: string): RoundtableAudience | null {
  if (value === "founder" || value === "youtube") return value;
  return null;
}

function asCount(value: string | number | null | undefined): number {
  const count = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.trunc(count);
}

function mapMessage(row: MessageRow): RoundtableMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorKind: row.author_kind === "founder" ? "founder" : "agent",
    authorId: row.author_id,
    body: row.body,
    createdAt: asIso(row.created_at),
  };
}

function mapSummary(row: ThreadRow, messageCount: number): RoundtableThreadSummary | null {
  const audience = asAudience(row.audience);
  if (!audience) return null;
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    audience,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    messageCount,
  };
}

function newId(prefix: "rt" | "rm"): string {
  return `${prefix}-${randomBytes(8).toString("hex")}`;
}

async function readMessage(id: string): Promise<RoundtableMessage | null> {
  const rows = await sqlQuery<MessageRow>(MESSAGE_SQL, [id]);
  const row = rows[0];
  return row ? mapMessage(row) : null;
}

async function readThread(
  id: string,
  options?: { founderOnly?: boolean },
): Promise<RoundtableThread | null> {
  const rows = await sqlQuery<ThreadRow>(THREAD_SQL, [id]);
  const row = rows[0];
  if (!row) return null;
  const audience = asAudience(row.audience);
  if (!audience) return null;
  if (options?.founderOnly && audience !== "founder") return null;
  const messages = (await sqlQuery<MessageRow>(MESSAGES_SQL, [id])).map(mapMessage);
  const summary = mapSummary(row, messages.length);
  if (!summary) return null;
  return { ...summary, messages };
}

export async function readFounderThreads(): Promise<RoundtableThreadSummary[]> {
  const rows = await sqlQuery<ThreadRow>(THREADS_SQL);
  const threads: RoundtableThreadSummary[] = [];
  for (const row of rows) {
    const summary = mapSummary(row, asCount(row.message_count));
    if (summary && summary.audience === "founder") threads.push(summary);
  }
  return threads;
}

export async function loadRoundtableHome(): Promise<RoundtableHomeModel> {
  const model = roundtableHomeModel(await readFounderThreads(), { publicMode: false });
  return model ?? { unavailable: true, count: 0, lines: [] };
}

/** Founder cards. Public mode skips the query and returns null. */
export async function loadRoundtableCards(publicMode: boolean): Promise<RoundtableCard[] | null> {
  if (publicMode) return null;
  return presentRoundtableCards(await readFounderThreads(), false);
}

/** Founder thread, including messages. A youtube row and a missing row are both null. */
export async function readFounderThread(id: string): Promise<RoundtableThread | null> {
  if (!isRoundtableId(id)) return null;
  return readThread(id, { founderOnly: true });
}

/** Founder thread for the page. Public mode skips the query. */
export async function loadRoundtableThread(
  id: string,
  publicMode: boolean,
): Promise<RoundtableThreadView | null> {
  if (publicMode) return null;
  return presentRoundtableThread(await readFounderThread(id), false);
}

function sameAgentMessage(existing: RoundtableMessage, post: AgentPost): boolean {
  return existing.authorKind === "agent" && existing.authorId === post.agentId && existing.body === post.body;
}

export async function postAgentMessage(post: AgentPost): Promise<RoundtableWrite> {
  if (post.messageId) {
    const existing = await readMessage(post.messageId);
    if (existing) {
      if (!sameAgentMessage(existing, post) || (post.threadId && existing.threadId !== post.threadId)) {
        return { ok: false, status: 409, error: "That message id is already used." };
      }
      const thread = await readThread(existing.threadId);
      if (!thread) return { ok: false, status: 409, error: "That message id is already used." };
      if (post.audience && post.audience !== thread.audience) {
        return { ok: false, status: 400, error: "Audience is set when the thread is created." };
      }
      return { ok: true, created: false, thread, message: existing };
    }
  }

  let threadId = post.threadId;
  let createdThread = false;
  if (threadId) {
    const current = await readThread(threadId);
    if (current) {
      if (post.audience && post.audience !== current.audience) {
        return { ok: false, status: 400, error: "Audience is set when the thread is created." };
      }
    } else {
      if (!post.title) return { ok: false, status: 400, error: "Title is required." };
      createdThread = true;
    }
  } else {
    if (!post.title) return { ok: false, status: 400, error: "Title is required." };
    threadId = newId("rt");
    createdThread = true;
  }

  const messageId = post.messageId ?? newId("rm");
  const title = post.title;
  if (createdThread && !title) return { ok: false, status: 400, error: "Title is required." };
  const statements = [];
  if (createdThread && title) {
    statements.push({
      text: `INSERT INTO roundtable_threads (id, agent_id, title, audience)
        VALUES ($1, $2, $3, $4)`,
      params: [threadId, post.agentId, title, post.audience ?? "founder"],
    });
  }
  statements.push({
    text: `INSERT INTO roundtable_messages (id, thread_id, author_kind, author_id, body)
      VALUES ($1, $2, 'agent', $3, $4)`,
    params: [messageId, threadId, post.agentId, post.body],
  });
  statements.push({
    text: `UPDATE roundtable_threads SET updated_at = now() WHERE id = $1`,
    params: [threadId],
  });
  await sqlTransaction(statements);

  const thread = await readThread(threadId);
  const message = thread?.messages.find((item) => item.id === messageId) ?? null;
  if (!thread || !message) {
    return { ok: false, status: 500, error: "Roundtable is unavailable." };
  }
  return { ok: true, created: true, thread, message };
}

export async function postFounderReply(
  threadId: string,
  reply: FounderReply,
  username: string,
): Promise<RoundtableWrite> {
  if (!isRoundtableId(threadId)) return { ok: false, status: 404, error: "Not found." };
  const current = await readThread(threadId);
  if (!current || current.audience !== "founder") {
    return { ok: false, status: 404, error: "Not found." };
  }
  if (reply.messageId) {
    const existing = await readMessage(reply.messageId);
    if (existing) {
      const same =
        existing.threadId === threadId &&
        existing.authorKind === "founder" &&
        existing.authorId === username &&
        existing.body === reply.body;
      if (!same) return { ok: false, status: 409, error: "That message id is already used." };
      return { ok: true, created: false, thread: current, message: existing };
    }
  }
  const messageId = reply.messageId ?? newId("rm");
  await sqlTransaction([
    {
      text: `INSERT INTO roundtable_messages (id, thread_id, author_kind, author_id, body)
        VALUES ($1, $2, 'founder', $3, $4)`,
      params: [messageId, threadId, username, reply.body],
    },
    {
      text: `UPDATE roundtable_threads SET updated_at = now() WHERE id = $1`,
      params: [threadId],
    },
  ]);
  const thread = await readThread(threadId);
  const message = thread?.messages.find((item) => item.id === messageId) ?? null;
  if (!thread || !message) {
    return { ok: false, status: 500, error: "Roundtable is unavailable." };
  }
  return { ok: true, created: true, thread, message };
}
