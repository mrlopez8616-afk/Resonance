import { NextResponse } from "next/server";
import {
  asWriteError,
  isDecisionsSyncConfigured,
  loadDecisionsStore,
  persistDecisionAttestation,
} from "@/lib/decisions-store";
import { authorizeDecisionRequest } from "@/lib/sync-auth";
import {
  XRPL_SETUP_STEPS,
  readXrplConfig,
  xrplNotConfiguredMessage,
} from "@/lib/xrpl-config";
import { xrplExplorerUrl } from "@/lib/xrpl-explorer";
import { XrplMirrorError, mirrorDecisionOnXrpl, parseXrplMirrorRequestBody } from "@/lib/xrpl-mirror";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function unauthorized(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

function notConfigured() {
  return NextResponse.json(
    {
      ok: false,
      configured: false,
      error:
        "Decision sync is not configured. In Vercel: Storage → Create Blob store → connect this project → redeploy. See docs/decision-sync.md.",
    },
    { status: 503 },
  );
}

function failureJson(error: unknown) {
  if (error instanceof XrplMirrorError) {
    const payload: Record<string, unknown> = {
      ok: false,
      error: error.message,
    };
    if (error.status === 503) {
      payload.setup = [...XRPL_SETUP_STEPS];
      payload.configured = false;
    }
    return NextResponse.json(payload, { status: error.status });
  }
  const mapped = asWriteError(error);
  return NextResponse.json(
    { ok: false, error: mapped.message },
    { status: mapped.status },
  );
}

async function postXrplMirror(request: Request) {
  const auth = authorizeDecisionRequest(request);
  if (!auth.ok) return unauthorized(auth.error);
  if (!isDecisionsSyncConfigured()) return notConfigured();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON body is required." },
      { status: 400 },
    );
  }

  const parsed = parseXrplMirrorRequestBody(body);
  const loaded = await loadDecisionsStore();
  const current = loaded.envelope.decisions.find((row) => row.id === parsed.id);
  if (!current) {
    return NextResponse.json(
      { ok: false, error: `Decision ${parsed.id} was not found in the shared store.` },
      { status: 404 },
    );
  }

  const config = readXrplConfig(process.env);

  if (!parsed.xrplTxHash && !config.configured) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: xrplNotConfiguredMessage(config),
        setup: [...XRPL_SETUP_STEPS],
        xrpl: {
          configured: false,
          network: config.network,
          account: config.account,
        },
      },
      { status: 503 },
    );
  }

  const mirrored = await mirrorDecisionOnXrpl({
    decision: current,
    request: parsed,
    config,
    submit: parsed.xrplTxHash
      ? undefined
      : async (input) => {
          // Signing is vendored (noble 1.x). Lazy-load after auth so a
          // submit crash cannot blank a 401.
          const { submitXrplDustMemo } = await import("@/lib/xrpl-submit");
          return submitXrplDustMemo(config, { memo: input.memo });
        },
  });

  const written = await persistDecisionAttestation({
    decision: mirrored.decision,
  });
  const stored =
    written.envelope.decisions.find((row) => row.id === mirrored.decision.id) ??
    mirrored.decision;

  return NextResponse.json({
    ok: true,
    mode: mirrored.mode,
    configured: true,
    backend: written.backend,
    updatedAt: written.envelope.updatedAt,
    decision: stored,
    xrpl: {
      configured: config.configured,
      network: config.network,
      account: config.account,
      txHash: mirrored.txHash,
      explorerUrl: xrplExplorerUrl(config.network, mirrored.txHash),
    },
  });
}

export async function POST(request: Request) {
  try {
    return await postXrplMirror(request);
  } catch (error) {
    return failureJson(error);
  }
}
