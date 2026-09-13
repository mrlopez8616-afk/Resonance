import type { Decision } from "./types";

export type DecisionsSyncState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "synced";
      backend: string;
      updatedAt: string | null;
      count: number;
    }
  | { status: "local"; reason: string }
  | { status: "error"; message: string };

const listeners = new Set<() => void>();
let snapshot: DecisionsSyncState = { status: "idle" };

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeDecisionsSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDecisionsSyncSnapshot(): DecisionsSyncState {
  return snapshot;
}

export function getServerDecisionsSyncSnapshot(): DecisionsSyncState {
  return { status: "idle" };
}

function setSnapshot(next: DecisionsSyncState) {
  snapshot = next;
  emit();
}

export interface HederaHealthSnapshot {
  configured?: boolean;
  network?: "testnet";
  operatorId?: string;
  topicId?: string | null;
}

export interface DecisionsHealth {
  ok: boolean;
  decisionsSync?: {
    configured?: boolean;
    backend?: string;
    recordCount?: number;
    updatedAt?: string | null;
  };
  hedera?: HederaHealthSnapshot;
}

export async function fetchDecisionsHealth(): Promise<DecisionsHealth | null> {
  try {
    const response = await fetch("/api/health", { credentials: "include" });
    if (!response.ok) return null;
    return (await response.json()) as DecisionsHealth;
  } catch {
    return null;
  }
}

export async function pullServerDecisions(): Promise<
  | {
      ok: true;
      decisions: Decision[];
      updatedAt: string | null;
      backend: string;
    }
  | { ok: false; reason: "local" | "auth" | "error"; message: string }
> {
  try {
    const response = await fetch("/api/decisions", { credentials: "include" });
    if (response.status === 503) {
      return {
        ok: false,
        reason: "local",
        message: "Shared store is not configured yet. This browser stays local.",
      };
    }
    if (response.status === 401) {
      return {
        ok: false,
        reason: "auth",
        message: "Unlock the site to pull the shared Decision store.",
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        reason: "error",
        message: "Could not read the shared Decision store.",
      };
    }
    const body = (await response.json()) as {
      decisions?: Decision[];
      updatedAt?: string | null;
      backend?: string;
    };
    if (!Array.isArray(body.decisions)) {
      return {
        ok: false,
        reason: "error",
        message: "Shared store returned an unexpected payload.",
      };
    }
    return {
      ok: true,
      decisions: body.decisions,
      updatedAt: body.updatedAt ?? null,
      backend: body.backend ?? "unknown",
    };
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "Network error talking to the Decision store.",
    };
  }
}

export async function hydrateDecisionsFromServer(
  apply: (decisions: Decision[]) => void,
): Promise<DecisionsSyncState> {
  setSnapshot({ status: "checking" });
  const pulled = await pullServerDecisions();
  if (!pulled.ok) {
    const next: DecisionsSyncState =
      pulled.reason === "error"
        ? { status: "error", message: pulled.message }
        : { status: "local", reason: pulled.message };
    setSnapshot(next);
    return next;
  }
  apply(pulled.decisions);
  const next: DecisionsSyncState = {
    status: "synced",
    backend: pulled.backend,
    updatedAt: pulled.updatedAt,
    count: pulled.decisions.length,
  };
  setSnapshot(next);
  return next;
}

export async function pushDecisionRecords(
  decisions: Array<Partial<Decision> & { id: string }>,
): Promise<boolean> {
  if (decisions.length === 0) return false;
  try {
    const response = await fetch("/api/decisions", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function attestDecisionOnServer(
  id: string,
): Promise<
  | {
      ok: true;
      decision: Decision;
      messageId: string | null;
      explorerUrl: string | null;
      topicId: string | null;
      note?: string;
    }
  | { ok: false; status: number; message: string }
> {
  try {
    const response = await fetch("/api/attest", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const body = (await response.json()) as {
      error?: string;
      decision?: Decision;
      note?: string;
      hedera?: {
        messageId?: string | null;
        explorerUrl?: string | null;
        topicId?: string | null;
      };
    };
    if (!response.ok || !body.decision) {
      return {
        ok: false,
        status: response.status,
        message: body.error ?? "Could not attest this decision.",
      };
    }
    return {
      ok: true,
      decision: body.decision,
      messageId: body.hedera?.messageId ?? body.decision.hederaMessageId,
      explorerUrl: body.hedera?.explorerUrl ?? null,
      topicId: body.hedera?.topicId ?? null,
      note: body.note,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Network error talking to the attest endpoint.",
    };
  }
}

export async function deleteServerDecision(id: string): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/decisions?id=${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "include" },
    );
    return response.ok || response.status === 503;
  } catch {
    return false;
  }
}

const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleDecisionPush(decision: Decision, delayMs = 700) {
  const previous = pushTimers.get(decision.id);
  if (previous) clearTimeout(previous);
  pushTimers.set(
    decision.id,
    setTimeout(() => {
      pushTimers.delete(decision.id);
      void pushDecisionRecords([decision]);
    }, delayMs),
  );
}

export function pushDecisionNow(decision: Decision) {
  const previous = pushTimers.get(decision.id);
  if (previous) clearTimeout(previous);
  pushTimers.delete(decision.id);
  void pushDecisionRecords([decision]);
}
