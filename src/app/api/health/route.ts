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
import { loadTodosStore } from "@/lib/todos-store";
import { todosStoreHealth } from "@/lib/todos-store-core";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isDecisionsSyncConfigured();
  let envelope = null;
  let todosEnvelope = null;
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
  }

  return NextResponse.json({
    ok: true,
    service: "resonance",
    note: "Shared Decision store: GET/POST/PATCH /api/decisions. Hedera Testnet attest: POST /api/attest. XRPL Testnet dust-memo mirror: POST /api/xrpl-mirror. Operator ack (no Hedera): POST /api/ack. Operator to-dos: GET/POST/PATCH /api/todos. Hub auth is Bearer RESONANCE_SYNC_SECRET (or the site password). Setup: docs/decision-sync.md, docs/hedera-attestation.md, docs/xrpl-mirror.md.",
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
    hedera: hederaHealth(process.env, envelope?.hederaTopicId ?? null),
    xrpl: xrplHealth(process.env),
  });
}
