import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { TodosImportError } from "./todos";
import {
  createEmptyTodosEnvelope,
  DEFAULT_TODOS_FILE,
  deleteTodoFromEnvelope,
  detectTodosBackend,
  isTodosSyncConfigured,
  parseTodosEnvelope,
  TODOS_BLOB_PATH,
  writeTodosIntoEnvelope,
  type TodosStoreBackend,
  type TodosStoreEnvelope,
} from "./todos-store-core";

export {
  detectTodosBackend,
  isTodosSyncConfigured,
  type TodosStoreBackend,
  type TodosStoreEnvelope,
};

export class TodosStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TodosStoreError";
  }
}

function filePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.RESONANCE_TODOS_FILE?.trim();
  return path.resolve(configured || DEFAULT_TODOS_FILE);
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const response = new Response(stream);
  return response.text();
}

async function readBlobEnvelope(): Promise<TodosStoreEnvelope | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(TODOS_BLOB_PATH, {
    access: "private",
    useCache: false,
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }
  const text = await streamToString(result.stream);
  if (!text.trim()) return null;
  try {
    return parseTodosEnvelope(JSON.parse(text));
  } catch {
    return null;
  }
}

async function writeBlobEnvelope(envelope: TodosStoreEnvelope): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(TODOS_BLOB_PATH, JSON.stringify(envelope, null, 2), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

async function readFileEnvelope(): Promise<TodosStoreEnvelope | null> {
  try {
    const text = await readFile(filePath(), "utf8");
    if (!text.trim()) return null;
    return parseTodosEnvelope(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeFileEnvelope(envelope: TodosStoreEnvelope): Promise<void> {
  const target = filePath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

async function readRawEnvelope(): Promise<TodosStoreEnvelope | null> {
  const backend = detectTodosBackend();
  if (backend === "blob") return readBlobEnvelope();
  if (backend === "file") return readFileEnvelope();
  return null;
}

async function persistEnvelope(envelope: TodosStoreEnvelope): Promise<void> {
  const backend = detectTodosBackend();
  if (backend === "blob") {
    await writeBlobEnvelope(envelope);
    return;
  }
  if (backend === "file") {
    await writeFileEnvelope(envelope);
    return;
  }
  throw new TodosStoreError(
    "To-do sync is not configured. Create a Vercel Blob store and redeploy.",
  );
}

export async function loadTodosStore(): Promise<{
  configured: boolean;
  backend: TodosStoreBackend;
  envelope: TodosStoreEnvelope;
}> {
  const backend = detectTodosBackend();
  if (backend === "none") {
    return {
      configured: false,
      backend,
      envelope: createEmptyTodosEnvelope(),
    };
  }
  const raw = await readRawEnvelope();
  const envelope = raw ?? createEmptyTodosEnvelope();
  if (!raw) {
    await persistEnvelope(envelope);
  }
  return { configured: true, backend, envelope };
}

export async function mergeTodosWrite(body: unknown): Promise<{
  envelope: TodosStoreEnvelope;
  backend: TodosStoreBackend;
}> {
  if (!isTodosSyncConfigured()) {
    throw new TodosStoreError(
      "To-do sync is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const items = collectTodoWriteItems(body);
  const loaded = await loadTodosStore();
  const envelope = writeTodosIntoEnvelope(loaded.envelope, items);
  await persistEnvelope(envelope);
  return { envelope, backend: loaded.backend };
}

export async function deleteStoredTodo(id: string): Promise<{
  envelope: TodosStoreEnvelope;
  backend: TodosStoreBackend;
  found: boolean;
}> {
  if (!isTodosSyncConfigured()) {
    throw new TodosStoreError(
      "To-do sync is not configured. Create a Vercel Blob store and redeploy.",
    );
  }
  const loaded = await loadTodosStore();
  const found = loaded.envelope.todos.some((row) => row.id === id);
  const envelope = deleteTodoFromEnvelope(loaded.envelope, id);
  await persistEnvelope(envelope);
  return { envelope, backend: loaded.backend, found };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectTodoWriteItems(
  body: unknown,
): Array<Partial<import("./todos").OperatorTodo> & Record<string, unknown>> {
  if (body == null) {
    throw new TodosImportError("Expected a JSON object or array.");
  }
  if (Array.isArray(body)) {
    return body.map((item, index) => {
      if (!isRecord(item)) {
        throw new TodosImportError(`todos[${index}] must be an object.`);
      }
      return item;
    });
  }
  if (!isRecord(body)) {
    throw new TodosImportError("Expected a JSON object or array.");
  }
  if (Array.isArray(body.todos)) {
    return body.todos.map((item, index) => {
      if (!isRecord(item)) {
        throw new TodosImportError(`todos[${index}] must be an object.`);
      }
      return item;
    });
  }
  if (typeof body.id === "string" || typeof body.text === "string") {
    return [body];
  }
  throw new TodosImportError(
    "JSON must include id, text, a todos array, or a single to-do object.",
  );
}

export function asTodoWriteError(error: unknown): {
  status: number;
  message: string;
} {
  if (error instanceof TodosImportError) {
    return { status: 400, message: error.message };
  }
  if (error instanceof TodosStoreError) {
    return { status: 503, message: error.message };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : "To-do store failed.",
  };
}
