import { SECRET_OR_ACCOUNT_ERROR, payloadLooksSecret, textLooksSecret } from "@/lib/approvals";
import { SYSTEM_AGENTS } from "@/data/system-map";

export const ROUNDTABLE_EMPTY = "no messages yet";
export const ROUNDTABLE_HREF = "/n/roundtable";

const TITLE_MAX = 140;
const BODY_MAX = 4000;
const ID_MAX = 64;

/** Lowercase slug. Agents may choose one; the store generates `rt-` and `rm-` ids. */
export const ROUNDTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const ROUNDTABLE_AUDIENCES = ["founder", "youtube"] as const;
export type RoundtableAudience = (typeof ROUNDTABLE_AUDIENCES)[number];

export type RoundtableAgentId = (typeof SYSTEM_AGENTS)[number]["id"];

const AGENT_NAMES = new Map<string, string>(SYSTEM_AGENTS.map((agent) => [agent.id, agent.name]));

export type RoundtableThreadSummary = {
  id: string;
  agentId: string;
  title: string;
  audience: RoundtableAudience;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type RoundtableMessage = {
  id: string;
  threadId: string;
  authorKind: "agent" | "founder";
  authorId: string;
  body: string;
  createdAt: string;
};

export type RoundtableThread = RoundtableThreadSummary & {
  messages: RoundtableMessage[];
};

export type RoundtableCard = {
  id: string;
  href: string;
  agentName: string;
  title: string;
  when: string;
  countLabel: string;
};

export type RoundtableMessageView = {
  id: string;
  authorLabel: string;
  body: string;
  when: string;
};

export type RoundtableThreadView = {
  id: string;
  agentName: string;
  title: string;
  countLabel: string;
  messages: RoundtableMessageView[];
};

export type RoundtableHomeModel = {
  unavailable: boolean;
  count: number;
  lines: string[];
};

export type AgentPost = {
  agentId: RoundtableAgentId;
  title: string | null;
  body: string;
  /** Null when the agent omitted it. Create then uses founder. */
  audience: RoundtableAudience | null;
  threadId: string | null;
  messageId: string | null;
};

export type FounderReply = {
  body: string;
  messageId: string | null;
};

type Fail = { ok: false; status: 400; error: string };
type AgentParse = { ok: true; post: AgentPost } | Fail;
type ReplyParse = { ok: true; reply: FounderReply } | Fail;

export function isRoundtableId(value: string): boolean {
  return ROUNDTABLE_ID.test(value);
}

export function isRoundtableAgent(value: string): value is RoundtableAgentId {
  return AGENT_NAMES.has(value);
}

export function roundtableAgentName(agentId: string): string | null {
  return AGENT_NAMES.get(agentId) ?? null;
}

export function roundtableAuthorLabel(kind: "agent" | "founder", authorId: string): string {
  if (kind === "founder") return "Founder";
  return roundtableAgentName(authorId) ?? "Agent";
}

export function roundtableHref(id: string): string {
  return `${ROUNDTABLE_HREF}/${id}`;
}

/** One card line. A long title is cut so the home card stays short. */
export function roundtableLine(value: string, max = 72): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

export function roundtableCountLabel(count: number): string {
  if (count === 1) return "1 message";
  return `${count} messages`;
}

/** America/Chicago clock, same shape as the approval stamp. */
export function formatRoundtableWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * Home lines from founder threads the page already loaded.
 * Public mode returns null so titles never reach the client.
 * An empty board says `no messages yet` and does not invent a thread.
 */
export function roundtableHomeModel(
  threads: readonly RoundtableThreadSummary[],
  options: { publicMode: boolean; unavailable?: boolean },
): RoundtableHomeModel | null {
  if (options.publicMode) return null;
  if (options.unavailable) return { unavailable: true, count: 0, lines: [] };
  const founder = threads.filter((thread) => thread.audience === "founder");
  if (founder.length === 0) {
    return { unavailable: false, count: 0, lines: [ROUNDTABLE_EMPTY] };
  }
  return {
    unavailable: false,
    count: founder.length,
    lines: founder.slice(0, 3).map((thread) => roundtableLine(thread.title)),
  };
}

/** Parent cards. Public mode and youtube threads stay off the floor. */
export function presentRoundtableCards(
  threads: readonly RoundtableThreadSummary[],
  publicMode: boolean,
): RoundtableCard[] | null {
  if (publicMode) return null;
  return threads
    .filter((thread) => thread.audience === "founder")
    .map((thread) => ({
      id: thread.id,
      href: roundtableHref(thread.id),
      agentName: roundtableAgentName(thread.agentId) ?? "Agent",
      title: thread.title.trim(),
      when: formatRoundtableWhen(thread.updatedAt),
      countLabel: roundtableCountLabel(thread.messageCount),
    }));
}

/** Thread page. Youtube and public mode return null so the body is not rendered. */
export function presentRoundtableThread(
  thread: RoundtableThread | null,
  publicMode: boolean,
): RoundtableThreadView | null {
  if (publicMode || !thread || thread.audience !== "founder") return null;
  return {
    id: thread.id,
    agentName: roundtableAgentName(thread.agentId) ?? "Agent",
    title: thread.title.trim(),
    countLabel: roundtableCountLabel(thread.messageCount),
    messages: thread.messages.map((message) => ({
      id: message.id,
      authorLabel: roundtableAuthorLabel(message.authorKind, message.authorId),
      body: message.body,
      when: formatRoundtableWhen(message.createdAt),
    })),
  };
}

export function toThreadSummaryJson(thread: RoundtableThreadSummary) {
  return {
    id: thread.id,
    agent: thread.agentId,
    agent_name: roundtableAgentName(thread.agentId),
    title: thread.title,
    audience: thread.audience,
    created_at: thread.createdAt,
    updated_at: thread.updatedAt,
    message_count: thread.messageCount,
  };
}

export function toMessageJson(message: RoundtableMessage) {
  return {
    id: message.id,
    thread_id: message.threadId,
    author_kind: message.authorKind,
    author_id: message.authorId,
    author_label: roundtableAuthorLabel(message.authorKind, message.authorId),
    body: message.body,
    created_at: message.createdAt,
  };
}

export function toThreadJson(thread: RoundtableThread) {
  return {
    ...toThreadSummaryJson(thread),
    messages: thread.messages.map((message) => toMessageJson(message)),
  };
}

function fail(error: string): Fail {
  return { ok: false, status: 400, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  const present = keys.filter((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (present.length === 0) return undefined;
  if (present.length > 1) {
    const first = record[present[0] ?? ""];
    if (present.every((key) => record[key] === first)) return first;
    return { conflict: true };
  }
  return record[present[0] ?? ""];
}

function parseId(value: unknown, label: string): { ok: true; id: string | null } | Fail {
  if (value === undefined || value === null || value === "") return { ok: true, id: null };
  if (typeof value !== "string" || !isRoundtableId(value.trim())) {
    return fail(`${label} must be a lowercase slug.`);
  }
  const id = value.trim();
  if (id.length > ID_MAX) return fail(`${label} must be a lowercase slug.`);
  return { ok: true, id };
}

function parseBody(value: unknown): { ok: true; body: string } | Fail {
  if (typeof value !== "string") return fail("Message is required.");
  const body = value.trim();
  if (!body) return fail("Message is required.");
  if (body.length > BODY_MAX) return fail("Message is too long.");
  if (textLooksSecret(body)) return fail(SECRET_OR_ACCOUNT_ERROR);
  return { ok: true, body };
}

export function parseAgentPost(value: unknown): AgentParse {
  if (!isRecord(value)) return fail("JSON object is required.");
  if (payloadLooksSecret(value)) return fail(SECRET_OR_ACCOUNT_ERROR);
  const allowed = new Set([
    "agent",
    "title",
    "body",
    "audience",
    "threadId",
    "thread_id",
    "id",
    "messageId",
    "message_id",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return fail("Unknown field.");
  }
  const agentRaw = asText(value.agent);
  if (!agentRaw || !isRoundtableAgent(agentRaw)) return fail("Unknown agent.");
  const threadPick = pick(value, "threadId", "thread_id");
  if (threadPick && typeof threadPick === "object" && "conflict" in threadPick) {
    return fail("Use one name for the thread id.");
  }
  const messagePick = pick(value, "id", "messageId", "message_id");
  if (messagePick && typeof messagePick === "object" && "conflict" in messagePick) {
    return fail("Use one name for the message id.");
  }
  const threadId = parseId(threadPick, "Thread id");
  if (!threadId.ok) return threadId;
  const messageId = parseId(messagePick, "Message id");
  if (!messageId.ok) return messageId;

  let title: string | null = null;
  if (value.title !== undefined && value.title !== null) {
    if (typeof value.title !== "string") return fail("Title must be one line.");
    const trimmed = value.title.trim();
    if (!trimmed || /[\r\n]/.test(value.title) || trimmed.length > TITLE_MAX) {
      return fail("Title must be one line.");
    }
    if (textLooksSecret(trimmed)) return fail(SECRET_OR_ACCOUNT_ERROR);
    title = trimmed;
  }

  let audience: RoundtableAudience | null = null;
  if (value.audience !== undefined && value.audience !== null && value.audience !== "") {
    if (value.audience !== "founder" && value.audience !== "youtube") {
      return fail("Audience must be founder or youtube.");
    }
    audience = value.audience;
  }

  const body = parseBody(value.body);
  if (!body.ok) return body;
  if (!threadId.id && !title) return fail("Title is required.");

  return {
    ok: true,
    post: {
      agentId: agentRaw,
      title,
      body: body.body,
      audience,
      threadId: threadId.id,
      messageId: messageId.id,
    },
  };
}

export function parseFounderReply(value: unknown): ReplyParse {
  if (!isRecord(value)) return fail("JSON object is required.");
  if (payloadLooksSecret(value)) return fail(SECRET_OR_ACCOUNT_ERROR);
  const allowed = new Set(["body", "id", "messageId", "message_id"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return fail("Unknown field.");
  }
  const messagePick = pick(value, "id", "messageId", "message_id");
  if (messagePick && typeof messagePick === "object" && "conflict" in messagePick) {
    return fail("Use one name for the message id.");
  }
  const messageId = parseId(messagePick, "Message id");
  if (!messageId.ok) return messageId;
  const body = parseBody(value.body);
  if (!body.ok) return body;
  return { ok: true, reply: { body: body.body, messageId: messageId.id } };
}
