import { NextResponse } from "next/server";
import { isDecisionsSyncConfigured, loadDecisionsStore } from "@/lib/decisions-store";
import { toPublicDecisions, toPublicNodes } from "@/lib/public-view";
import { createSeedState } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  const seed = createSeedState();
  let decisions = seed.decisions;
  if (isDecisionsSyncConfigured()) {
    try {
      const loaded = await loadDecisionsStore();
      decisions = loaded.envelope.decisions;
    } catch {
      decisions = seed.decisions;
    }
  }

  return NextResponse.json({
    omitDryPowder: true,
    nodes: toPublicNodes(seed.nodes),
    decisions: toPublicDecisions(decisions),
  });
}
