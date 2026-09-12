import { NextResponse } from "next/server";
import { isGateEnabled } from "@/lib/app-gate";
import {
  detectDecisionsBackend,
  isDecisionsSyncConfigured,
  loadDecisionsStore,
} from "@/lib/decisions-store";
import { decisionsStoreHealth } from "@/lib/decisions-store-core";
import { hederaHealth } from "@/lib/hedera-config";
import { writeProtectionEnabled } from "@/lib/sync-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isDecisionsSyncConfigured();
  let envelope = null;
  if (configured) {
    try {
      const loaded = await loadDecisionsStore();
      envelope = loaded.envelope;
    } catch {
      envelope = null;
    }
  }

  return NextResponse.json({
    ok: true,
    service: "resonance",
    note: "Shared Decision store: GET/POST/PATCH /api/decisions. Hedera Testnet attest: POST /api/attest. Hub auth is Bearer RESONANCE_SYNC_SECRET (or the site password). Setup: docs/decision-sync.md and docs/hedera-attestation.md.",
    gate: { enabled: isGateEnabled() },
    decisionsSync: decisionsStoreHealth({
      configured,
      backend: detectDecisionsBackend(),
      writeProtection: writeProtectionEnabled() ? "on" : "off",
      envelope,
    }),
    hedera: hederaHealth(process.env, envelope?.hederaTopicId ?? null),
  });
}
