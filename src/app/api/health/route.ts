import { NextResponse } from "next/server";
import { isGateEnabled } from "@/lib/app-gate";
import {
  detectDecisionsBackend,
  isDecisionsSyncConfigured,
  loadDecisionsStore,
} from "@/lib/decisions-store";
import { decisionsStoreHealth } from "@/lib/decisions-store-core";
import { hederaHealth } from "@/lib/hedera-config";
import { xrplHealth } from "@/lib/xrpl-config";
import { writeProtectionEnabled } from "@/lib/sync-auth";
import { loadReportsStore } from "@/lib/reports-store";
import { reportsStoreHealth } from "@/lib/reports-store-core";
import { loadTodosStore } from "@/lib/todos-store";
import { todosStoreHealth } from "@/lib/todos-store-core";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isDecisionsSyncConfigured();
  let envelope = null;
  let todosEnvelope = null;
  let reportsEnvelope = null;
  if (configured) {
    try {
      const loaded = await loadDecisionsStore();
      envelope = loaded.envelope;
    } catch {
      envelope = null;
    }
    try {
      const loadedTodos = await loadTodosStore();
      todosEnvelope = loadedTodos.envelope;
    } catch {
      todosEnvelope = null;
    }
    try {
      const loadedReports = await loadReportsStore();
      reportsEnvelope = loadedReports.envelope;
    } catch {
      reportsEnvelope = null;
    }
  }

  return NextResponse.json({
    ok: true,
    service: "resonance",
    note: "Shared Decision store: GET/POST/PATCH /api/decisions. Hedera Testnet attest: POST /api/attest (Decision or report id). XRPL Testnet dust-memo mirror: POST /api/xrpl-mirror. Operator ack (no Hedera): POST /api/ack. Operator to-dos: GET/POST/PATCH /api/todos. Reports binder: GET/POST /api/reports (dayKey alias; same day+title merges). Hub auth is Bearer RESONANCE_SYNC_SECRET (or the site password). Setup: docs/decision-sync.md, docs/hedera-attestation.md, docs/xrpl-mirror.md, docs/reports-autofile.md.",
    gate: { enabled: isGateEnabled() },
    decisionsSync: decisionsStoreHealth({
      configured,
      backend: detectDecisionsBackend(),
      writeProtection: writeProtectionEnabled() ? "on" : "off",
      envelope,
    }),
    todosSync: todosStoreHealth({
      configured,
      backend: detectDecisionsBackend(),
      envelope: todosEnvelope,
    }),
    reportsSync: reportsStoreHealth({
      configured,
      backend: detectDecisionsBackend(),
      envelope: reportsEnvelope,
    }),
    hedera: hederaHealth(process.env, envelope?.hederaTopicId ?? null),
    xrpl: xrplHealth(process.env),
  });
}
