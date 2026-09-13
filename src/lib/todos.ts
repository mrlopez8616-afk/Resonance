import { newId } from "./format";

export const TODOS_STORAGE_KEY = "resonance.phase-zero.todos.v1";

export interface OperatorTodo {
  id: string;
  text: string;
  done: boolean;
  linkedDecisionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export class TodosImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TodosImportError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeTodo(
  raw: unknown,
  index: number,
  fallbackNow = "",
): OperatorTodo {
  if (!isRecord(raw)) {
    throw new TodosImportError(`todos[${index}] must be an object.`);
  }
  const id = asTrimmedString(raw.id) ?? `todo-${index}`;
  const text = asString(raw.text, "").trim();
  if (!text) {
    throw new TodosImportError(`todos[${index}].text is required.`);
  }
  const createdAt = asString(raw.createdAt, fallbackNow);
  return {
    id,
    text,
    done: asBoolean(raw.done, false),
    linkedDecisionId:
      asTrimmedString(raw.linkedDecisionId) ??
      asTrimmedString(raw.linked_decision_id),
    createdAt,
    updatedAt: asString(raw.updatedAt, createdAt || fallbackNow),
  };
}

/** Storage migrate: skip junk; empty text is dropped. */
export function coerceStoredTodo(
  raw: unknown,
  index: number,
): OperatorTodo | null {
  if (!isRecord(raw)) return null;
  const text = asString(raw.text, "").trim();
  if (!text) return null;
  const id = asTrimmedString(raw.id) ?? `todo-${index}`;
  const createdAt = asString(raw.createdAt, "");
  return {
    id,
    text,
    done: asBoolean(raw.done, false),
    linkedDecisionId:
      asTrimmedString(raw.linkedDecisionId) ??
      asTrimmedString(raw.linked_decision_id),
    createdAt,
    updatedAt: asString(raw.updatedAt, createdAt),
  };
}

export function todoContentEqual(a: OperatorTodo, b: OperatorTodo): boolean {
  return (
    a.text === b.text &&
    a.done === b.done &&
    a.linkedDecisionId === b.linkedDecisionId
  );
}

export function mergeTodosById(
  existing: OperatorTodo[],
  incoming: OperatorTodo[],
): OperatorTodo[] {
  const byId = new Map<string, OperatorTodo>();
  for (const item of existing) byId.set(item.id, item);
  for (const item of incoming) {
    const prev = byId.get(item.id);
    if (!prev) {
      byId.set(item.id, {
        ...item,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
      });
      continue;
    }
    byId.set(item.id, {
      ...prev,
      ...item,
      createdAt: prev.createdAt || item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
    });
  }
  return sortTodos(Array.from(byId.values()));
}

export function sortTodos(todos: OperatorTodo[]): OperatorTodo[] {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
    );
  });
}

export function createTodo(input: {
  text: string;
  linkedDecisionId?: string | null;
  now?: string;
  id?: string;
}): OperatorTodo {
  const text = input.text.trim();
  if (!text) {
    throw new TodosImportError("Write the to-do text.");
  }
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id?.trim() || newId("todo"),
    text,
    done: false,
    linkedDecisionId: input.linkedDecisionId?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyTodoPatch(
  current: OperatorTodo,
  patch: Partial<OperatorTodo>,
  now = new Date().toISOString(),
): OperatorTodo {
  const nextText =
    patch.text !== undefined ? patch.text.trim() : current.text;
  if (!nextText) {
    throw new TodosImportError("To-do text cannot be empty.");
  }
  return {
    ...current,
    ...patch,
    id: current.id,
    text: nextText,
    linkedDecisionId:
      patch.linkedDecisionId === undefined
        ? current.linkedDecisionId
        : patch.linkedDecisionId?.trim() || null,
    createdAt: current.createdAt || patch.createdAt || now,
    updatedAt: now,
  };
}

export function removeTodoById(
  existing: OperatorTodo[],
  id: string,
): OperatorTodo[] {
  return existing.filter((item) => item.id !== id);
}

export function pickTodoPatch(raw: Record<string, unknown>): Partial<OperatorTodo> {
  const patch: Partial<OperatorTodo> = {};
  if ("text" in raw) patch.text = asString(raw.text, "").trim();
  if ("done" in raw) patch.done = asBoolean(raw.done, false);
  if ("linkedDecisionId" in raw || "linked_decision_id" in raw) {
    patch.linkedDecisionId =
      asTrimmedString(raw.linkedDecisionId) ??
      asTrimmedString(raw.linked_decision_id);
  }
  if ("createdAt" in raw) patch.createdAt = asString(raw.createdAt, "");
  if ("updatedAt" in raw) patch.updatedAt = asString(raw.updatedAt, "");
  return patch;
}
