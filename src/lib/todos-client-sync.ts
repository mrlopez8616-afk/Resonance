import {
  createTodo,
  mergeTodosById,
  removeTodoById,
  sortTodos,
  TODOS_STORAGE_KEY,
  type OperatorTodo,
} from "./todos";

export type TodosSyncState =
  | { status: "idle"; todos: OperatorTodo[] }
  | { status: "checking"; todos: OperatorTodo[] }
  | {
      status: "synced";
      backend: string;
      updatedAt: string | null;
      todos: OperatorTodo[];
    }
  | { status: "local"; reason: string; todos: OperatorTodo[] }
  | { status: "error"; message: string; todos: OperatorTodo[] };

const listeners = new Set<() => void>();
let snapshot: TodosSyncState = { status: "idle", todos: [] };

function emit() {
  for (const listener of listeners) listener();
}

function readCachedTodos(): OperatorTodo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TODOS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { todos?: unknown };
    if (!Array.isArray(parsed.todos)) return [];
    return parsed.todos.filter(
      (item): item is OperatorTodo =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as OperatorTodo).id === "string" &&
        typeof (item as OperatorTodo).text === "string",
    );
  } catch {
    return [];
  }
}

function writeCachedTodos(todos: OperatorTodo[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    TODOS_STORAGE_KEY,
    JSON.stringify({ todos: sortTodos(todos) }),
  );
}

function setSnapshot(next: TodosSyncState) {
  snapshot = { ...next, todos: sortTodos(next.todos) };
  writeCachedTodos(snapshot.todos);
  emit();
}

export function subscribeTodosSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTodosSyncSnapshot(): TodosSyncState {
  if (snapshot.status === "idle" && snapshot.todos.length === 0) {
    const cached = readCachedTodos();
    if (cached.length > 0) {
      snapshot = { status: "idle", todos: sortTodos(cached) };
    }
  }
  return snapshot;
}

export function getServerTodosSyncSnapshot(): TodosSyncState {
  return { status: "idle", todos: [] };
}

function applyTodos(todos: OperatorTodo[], extra: Partial<TodosSyncState> = {}) {
  setSnapshot({
    ...snapshot,
    ...extra,
    todos,
  } as TodosSyncState);
}

export async function hydrateTodosFromServer(): Promise<TodosSyncState> {
  setSnapshot({ ...snapshot, status: "checking" });
  try {
    const response = await fetch("/api/todos", { credentials: "include" });
    if (response.status === 503) {
      const next: TodosSyncState = {
        status: "local",
        reason: "Shared store is not configured yet. This browser keeps the list locally.",
        todos: snapshot.todos,
      };
      setSnapshot(next);
      return next;
    }
    if (response.status === 401) {
      const next: TodosSyncState = {
        status: "local",
        reason: "Unlock the site to pull the shared to-do list.",
        todos: snapshot.todos,
      };
      setSnapshot(next);
      return next;
    }
    if (!response.ok) {
      const next: TodosSyncState = {
        status: "error",
        message: "Could not read the shared to-do list.",
        todos: snapshot.todos,
      };
      setSnapshot(next);
      return next;
    }
    const body = (await response.json()) as {
      todos?: OperatorTodo[];
      updatedAt?: string | null;
      backend?: string;
    };
    if (!Array.isArray(body.todos)) {
      const next: TodosSyncState = {
        status: "error",
        message: "Shared to-do store returned an unexpected payload.",
        todos: snapshot.todos,
      };
      setSnapshot(next);
      return next;
    }
    const next: TodosSyncState = {
      status: "synced",
      backend: body.backend ?? "unknown",
      updatedAt: body.updatedAt ?? null,
      todos: body.todos,
    };
    setSnapshot(next);
    return next;
  } catch {
    const next: TodosSyncState = {
      status: "error",
      message: "Network error talking to the to-do store.",
      todos: snapshot.todos,
    };
    setSnapshot(next);
    return next;
  }
}

async function pushTodos(
  payload: unknown,
): Promise<OperatorTodo[] | null> {
  try {
    const response = await fetch("/api/todos", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 503) return null;
    if (!response.ok) return null;
    const body = (await response.json()) as { todos?: OperatorTodo[] };
    return Array.isArray(body.todos) ? body.todos : null;
  } catch {
    return null;
  }
}

export async function addOperatorTodo(input: {
  text: string;
  linkedDecisionId?: string | null;
}): Promise<void> {
  const created = createTodo(input);
  const optimistic = mergeTodosById(snapshot.todos, [created]);
  applyTodos(optimistic);
  const server = await pushTodos(created);
  if (server) {
    setSnapshot({
      status: "synced",
      backend: snapshot.status === "synced" ? snapshot.backend : "unknown",
      updatedAt: snapshot.status === "synced" ? snapshot.updatedAt : null,
      todos: server,
    });
  }
}

export async function toggleOperatorTodo(id: string): Promise<void> {
  const current = snapshot.todos.find((item) => item.id === id);
  if (!current) return;
  const next = {
    ...current,
    done: !current.done,
    updatedAt: new Date().toISOString(),
  };
  applyTodos(mergeTodosById(snapshot.todos, [next]));
  const server = await pushTodos({ id, done: next.done });
  if (server) {
    applyTodos(server, { status: snapshot.status });
  }
}

export async function deleteOperatorTodo(id: string): Promise<void> {
  applyTodos(removeTodoById(snapshot.todos, id));
  try {
    const response = await fetch(
      `/api/todos?id=${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "include" },
    );
    if (response.ok) {
      const body = (await response.json()) as { todos?: OperatorTodo[] };
      if (Array.isArray(body.todos)) applyTodos(body.todos);
    }
  } catch {
    // Local delete already applied.
  }
}

export async function attestDecisionOnServer(
  id: string,
): Promise<{
  ok: boolean;
  decision: import("./types").Decision | null;
}> {
  try {
    const response = await fetch("/api/attest", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      return { ok: false, decision: null };
    }
    const body = (await response.json()) as {
      decision?: import("./types").Decision;
    };
    return { ok: true, decision: body.decision ?? null };
  } catch {
    return { ok: false, decision: null };
  }
}
