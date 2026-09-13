"use client";

import { OperatorTodoList } from "@/components/operator-todos";
import { PageHeader } from "@/components/page-header";
import { useStore } from "@/context/store";

export default function TodosPage() {
  const { ready, state } = useStore();

  if (!ready) {
    return <p className="text-sm text-[color:var(--muted)]">Loading todos…</p>;
  }

  return (
    <div>
      <PageHeader
        kicker="OS"
        title="Todos"
        description="Operator list that does not live inside a node. Same store as Decisions → To-do. Shared Blob file when sync is configured."
      />
      <OperatorTodoList decisions={state.decisions} />
    </div>
  );
}
