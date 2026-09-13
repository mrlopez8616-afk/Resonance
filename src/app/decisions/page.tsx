"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DecisionArchiveBrowser } from "@/components/decision-archive";
import { DecisionsImportPanel } from "@/components/decisions-import";
import { DecisionsSyncBanner } from "@/components/decisions-sync";
import { NewDecisionForm } from "@/components/new-decision-form";
import { OperatorTodoList } from "@/components/operator-todos";
import { PageHeader } from "@/components/page-header";
import { useStore } from "@/context/store";
import { decisionsTabHref } from "@/lib/decision-browser";

type DecisionsTab = "archive" | "todos" | "new";

function parseTab(value: string | null): DecisionsTab {
  if (value === "todos" || value === "new") return value;
  return "archive";
}

export default function DecisionsPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-[color:var(--muted)]">Loading record book…</p>
      }
    >
      <DecisionsPageInner />
    </Suspense>
  );
}

function DecisionsPageInner() {
  const { ready, state, exportDecisionsJson } = useStore();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const folderKey = searchParams.get("folder");

  function downloadExport() {
    const blob = new Blob([exportDecisionsJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "resonance-decisions.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!ready) {
    return (
      <p className="text-sm text-[color:var(--muted)]">Loading record book…</p>
    );
  }

  return (
    <div>
      <PageHeader
        kicker="Record Book"
        title="Decisions"
        description="Phase Zero archive for Andres López. Open a date folder, then a decision file. The to-do list sits on the same tab. Shared store + hub PATCH merge by ID. On-chain fingerprint comes later — Web2 only."
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={downloadExport}
          >
            Export decisions JSON
          </button>
        }
      />

      <div className="notice notice-warn mb-8">
        <p className="font-medium text-[color:var(--text)]">
          This is the OS record book. Folders are dates. Files are the full
          records (question, proposal, options, founder decision, why, who
          authorized, outcome, receipt, review trigger, attestation).
        </p>
        <p className="mt-2">
          Hub can POST/PATCH /api/decisions (queued → filled) and this page
          pulls the shared store. JSON import remains a fallback. Blockchain
          recording is out of scope for Phase Zero.
        </p>
      </div>

      <DecisionsSyncBanner />

      <DecisionsSectionNav tab={folderKey ? "archive" : tab} />

      {tab === "todos" && !folderKey ? (
        <OperatorTodoList decisions={state.decisions} />
      ) : tab === "new" && !folderKey ? (
        <>
          <NewDecisionForm />
          <DecisionsImportPanel />
        </>
      ) : (
        <DecisionArchiveBrowser
          decisions={state.decisions}
          folderKey={folderKey}
        />
      )}
    </div>
  );
}

function DecisionsSectionNav({ tab }: { tab: DecisionsTab }) {
  const items: Array<{ id: DecisionsTab; href: string; label: string }> = [
    { id: "archive", href: decisionsTabHref("archive"), label: "Archive" },
    { id: "todos", href: decisionsTabHref("todos"), label: "To-do" },
    { id: "new", href: decisionsTabHref("new"), label: "New record" },
  ];
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={`btn ${
            tab === item.id ? "btn-primary" : "btn-secondary"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
