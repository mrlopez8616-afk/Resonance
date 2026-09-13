import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTodo, mergeTodosById, removeTodoById } from "./todos";
import {
  createEmptyTodosEnvelope,
  deleteTodoFromEnvelope,
  parseTodosEnvelope,
  todosStoreHealth,
  writeTodosIntoEnvelope,
} from "./todos-store-core";

describe("operator todo merge", () => {
  it("adds a new to-do and updates an existing one by id", () => {
    const now = "2026-09-13T00:00:00.000Z";
    const first = createTodo({
      text: "Confirm Monday fills",
      linkedDecisionId: "D-2026-09-11-03",
      now,
      id: "todo-1",
    });
    const envelope = writeTodosIntoEnvelope(
      createEmptyTodosEnvelope(now),
      [first],
      now,
    );
    assert.equal(envelope.todos.length, 1);
    assert.equal(envelope.todos[0]?.linkedDecisionId, "D-2026-09-11-03");

    const later = "2026-09-13T01:00:00.000Z";
    const next = writeTodosIntoEnvelope(
      envelope,
      [{ id: "todo-1", done: true }],
      later,
    );
    assert.equal(next.todos[0]?.done, true);
    assert.equal(next.todos[0]?.text, "Confirm Monday fills");
    assert.equal(next.todos[0]?.createdAt, now);
    assert.equal(next.todos[0]?.updatedAt, later);
  });

  it("merges two lists by id without dropping the other row", () => {
    const a = createTodo({ text: "A", id: "todo-a", now: "2026-09-13T00:00:00.000Z" });
    const b = createTodo({ text: "B", id: "todo-b", now: "2026-09-13T00:01:00.000Z" });
    const merged = mergeTodosById([a], [{ ...b }, { ...a, text: "A revised", updatedAt: "2026-09-13T00:02:00.000Z" }]);
    assert.equal(merged.find((item) => item.id === "todo-a")?.text, "A revised");
    assert.equal(merged.find((item) => item.id === "todo-b")?.text, "B");
    assert.equal(merged.length, 2);
  });

  it("deletes by id and keeps the rest", () => {
    const envelope = writeTodosIntoEnvelope(createEmptyTodosEnvelope(), [
      { id: "todo-keep", text: "Keep" },
      { id: "todo-drop", text: "Drop" },
    ]);
    const next = deleteTodoFromEnvelope(envelope, "todo-drop");
    assert.deepEqual(
      next.todos.map((item) => item.id),
      ["todo-keep"],
    );
    assert.deepEqual(removeTodoById(envelope.todos, "todo-drop").map((item) => item.id), [
      "todo-keep",
    ]);
  });

  it("parses a persisted envelope and skips empty text", () => {
    const parsed = parseTodosEnvelope({
      version: 1,
      updatedAt: "2026-09-13T00:00:00.000Z",
      todos: [
        { id: "todo-1", text: "Open D-04", done: false },
        { id: "todo-empty", text: "   " },
        { not: "a todo" },
      ],
    });
    assert.equal(parsed?.todos.length, 1);
    assert.equal(parsed?.todos[0]?.id, "todo-1");
  });

  it("health payload has counts, not to-do text", () => {
    const envelope = writeTodosIntoEnvelope(createEmptyTodosEnvelope(), [
      { text: "Secret operator note about a fill" },
    ]);
    const health = todosStoreHealth({
      configured: true,
      backend: "blob",
      envelope,
    });
    const blob = JSON.stringify(health);
    assert.equal(health.itemCount, 1);
    assert.ok(!blob.includes("Secret"));
    assert.ok(!blob.includes("fill"));
  });
});
