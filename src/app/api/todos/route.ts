import { NextResponse } from "next/server";
import { authorizeDecisionRequest } from "@/lib/sync-auth";
import {
  asTodoWriteError,
  deleteStoredTodo,
  isTodosSyncConfigured,
  loadTodosStore,
  mergeTodosWrite,
} from "@/lib/todos-store";
import type { OperatorTodo } from "@/lib/todos";

export const dynamic = "force-dynamic";

function unauthorized(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

function notConfigured() {
  return NextResponse.json(
    {
      ok: false,
      configured: false,
      error:
        "To-do sync is not configured. In Vercel: Storage → Create Blob store → connect this project → redeploy. See docs/decision-sync.md.",
    },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const auth = authorizeDecisionRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isTodosSyncConfigured()) return notConfigured();

  try {
    const loaded = await loadTodosStore();
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const todos: OperatorTodo[] = id
      ? loaded.envelope.todos.filter((row) => row.id === id)
      : loaded.envelope.todos;
    return NextResponse.json({
      ok: true,
      configured: true,
      backend: loaded.backend,
      updatedAt: loaded.envelope.updatedAt,
      todos,
    });
  } catch (error) {
    const mapped = asTodoWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}

async function write(request: Request) {
  const auth = authorizeDecisionRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isTodosSyncConfigured()) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body is required." },
      { status: 400 },
    );
  }

  try {
    const written = await mergeTodosWrite(body);
    return NextResponse.json({
      ok: true,
      configured: true,
      backend: written.backend,
      updatedAt: written.envelope.updatedAt,
      todos: written.envelope.todos,
    });
  } catch (error) {
    const mapped = asTodoWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}

export async function POST(request: Request) {
  return write(request);
}

export async function PATCH(request: Request) {
  return write(request);
}

export async function DELETE(request: Request) {
  const auth = authorizeDecisionRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isTodosSyncConfigured()) return notConfigured();

  const url = new URL(request.url);
  let id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    try {
      const body = (await request.json()) as { id?: unknown };
      if (typeof body.id === "string") id = body.id.trim();
    } catch {
      id = "";
    }
  }
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id is required to delete a to-do." },
      { status: 400 },
    );
  }

  try {
    const written = await deleteStoredTodo(id);
    return NextResponse.json({
      ok: true,
      configured: true,
      backend: written.backend,
      found: written.found,
      updatedAt: written.envelope.updatedAt,
      todos: written.envelope.todos,
    });
  } catch (error) {
    const mapped = asTodoWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}
