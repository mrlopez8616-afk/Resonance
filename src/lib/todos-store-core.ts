import {
  applyTodoPatch,
  coerceStoredTodo,
  createTodo,
  mergeTodosById,
  pickTodoPatch,
  removeTodoById,
  sortTodos,
  TodosImportError,
  type OperatorTodo,
} from "./todos";
import {
  detectDecisionsBackend,
  isDecisionsSyncConfigured,
  type DecisionsStoreBackend,
} from "./decisions-store-core";

export const TODOS_STORE_VERSION = 1;
export const TODOS_BLOB_PATH = "resonance/todos.json";
export const DEFAULT_TODOS_FILE = ".data/todos.json";

export type TodosStoreBackend = DecisionsStoreBackend;

export interface TodosStoreEnvelope {
  version: typeof TODOS_STORE_VERSION;
  updatedAt: string;
  todos: OperatorTodo[];
}

export function detectTodosBackend(
  env: NodeJS.ProcessEnv = process.env,
): TodosStoreBackend {
  return detectDecisionsBackend(env);
}

export function isTodosSyncConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isDecisionsSyncConfigured(env);
}

export function createEmptyTodosEnvelope(
  now = new Date().toISOString(),
): TodosStoreEnvelope {
  return {
    version: TODOS_STORE_VERSION,
    updatedAt: now,
    todos: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTodosEnvelope(raw: unknown): TodosStoreEnvelope | null {
  if (!isRecord(raw) || !Array.isArray(raw.todos)) return null;
  const todos = raw.todos
    .map((item, index) => coerceStoredTodo(item, index))
    .filter((item): item is OperatorTodo => item !== null);
  return {
    version: TODOS_STORE_VERSION,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : new Date().toISOString(),
    todos: sortTodos(todos),
  };
}

export function writeTodosIntoEnvelope(
  envelope: TodosStoreEnvelope,
  items: Array<Partial<OperatorTodo> & Record<string, unknown>>,
  now = new Date().toISOString(),
): TodosStoreEnvelope {
  const materialized: OperatorTodo[] = [];
  for (const [index, raw] of items.entries()) {
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const prev = id
      ? envelope.todos.find((item) => item.id === id)
      : undefined;
    if (prev) {
      materialized.push(applyTodoPatch(prev, pickTodoPatch(raw), now));
      continue;
    }
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text) {
      throw new TodosImportError(`todos[${index}].text is required.`);
    }
    materialized.push(
      createTodo({
        text,
        linkedDecisionId:
          typeof raw.linkedDecisionId === "string"
            ? raw.linkedDecisionId
            : typeof raw.linked_decision_id === "string"
              ? raw.linked_decision_id
              : null,
        now,
        id: id || undefined,
      }),
    );
  }
  return {
    ...envelope,
    updatedAt: now,
    todos: mergeTodosById(envelope.todos, materialized),
  };
}

export function deleteTodoFromEnvelope(
  envelope: TodosStoreEnvelope,
  id: string,
  now = new Date().toISOString(),
): TodosStoreEnvelope {
  return {
    ...envelope,
    updatedAt: now,
    todos: removeTodoById(envelope.todos, id),
  };
}

export function todosStoreHealth(input: {
  configured: boolean;
  backend: TodosStoreBackend;
  envelope: TodosStoreEnvelope | null;
}): {
  configured: boolean;
  backend: TodosStoreBackend;
  itemCount: number;
  updatedAt: string | null;
} {
  return {
    configured: input.configured,
    backend: input.backend,
    itemCount: input.envelope?.todos.length ?? 0,
    updatedAt: input.envelope?.updatedAt ?? null,
  };
}
