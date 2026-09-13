import { NextResponse } from "next/server";
import {
  AttestationError,
  attestDecision,
  attestReport,
  parseAttestRequestBody,
} from "@/lib/hedera-attest";
import {
  HEDERA_SETUP_STEPS,
  hederaNotConfiguredMessage,
  readHederaConfig,
} from "@/lib/hedera-config";
import { hederaExplorerUrl } from "@/lib/hedera-explorer";
import { submitHcsAttestation } from "@/lib/hedera-submit";
import {
  asWriteError,
  isDecisionsSyncConfigured,
  loadDecisionsStore,
  persistDecisionAttestation,
  persistHederaTopicId,
} from "@/lib/decisions-store";
import {
  asReportWriteError,
  isReportsSyncConfigured,
  loadReportById,
  persistReportAttestation,
} from "@/lib/reports-store";
import { authorizeDecisionRequest } from "@/lib/sync-auth";

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

export async function POST(request: Request) {
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

  try {
    const parsed = parseAttestRequestBody(body);
    const loaded = await loadDecisionsStore();
    const current = loaded.envelope.decisions.find((row) => row.id === parsed.id);
    const reportLoaded =
      !current && isReportsSyncConfigured()
        ? await loadReportById(parsed.id)
        : null;
    const report = reportLoaded?.report ?? null;

    if (!current && !report) {
      return NextResponse.json(
        {
          ok: false,
          error: `Decision or report ${parsed.id} was not found in the shared store.`,
        },
        { status: 404 },
      );
    }

    const config = readHederaConfig(
      process.env,
      loaded.envelope.hederaTopicId ?? null,
    );

    if (!parsed.hederaMessageId && !config.configured) {
      return NextResponse.json(
        {
          ok: false,
          configured: false,
          error: hederaNotConfiguredMessage(config),
          setup: [...HEDERA_SETUP_STEPS],
          hedera: {
            configured: false,
            network: config.network,
            operatorId: config.operatorId,
            topicId: config.topicId,
          },
        },
        { status: 503 },
      );
    }

    if (report) {
      const attested = await attestReport({
        report,
        request: parsed,
        config,
        submit: parsed.hederaMessageId
          ? undefined
          : (input) => submitHcsAttestation(config, input),
      });
      const written = await persistReportAttestation({
        report: attested.report,
      });
      if (attested.topicCreated && attested.topicId) {
        await persistHederaTopicId(attested.topicId);
      }
      const stored =
        written.envelope.reports.find((row) => row.id === attested.report.id) ??
        attested.report;
      return NextResponse.json({
        ok: true,
        mode: attested.mode,
        configured: true,
        backend: written.backend,
        updatedAt: written.envelope.updatedAt,
        report: stored,
        hedera: {
          configured: config.configured,
          network: config.network,
          operatorId: config.operatorId,
          topicId: attested.topicId ?? loaded.envelope.hederaTopicId ?? null,
          messageId: attested.messageId,
          transactionId: attested.transactionId,
          explorerUrl:
            stored.attestLink ??
            hederaExplorerUrl(config.network, attested.messageId),
          topicCreated: attested.topicCreated,
        },
        note: attested.topicCreated
          ? `Save HEDERA_TOPIC_ID=${attested.topicId} on Vercel so later attests reuse this topic.`
          : undefined,
      });
    }

    const attested = await attestDecision({
      decision: current!,
      request: parsed,
      config,
      submit: parsed.hederaMessageId
        ? undefined
        : (input) => submitHcsAttestation(config, input),
    });

    const written = await persistDecisionAttestation({
      decision: attested.decision,
      hederaTopicId: attested.topicId,
    });
    const stored =
      written.envelope.decisions.find((row) => row.id === attested.decision.id) ??
      attested.decision;

    return NextResponse.json({
      ok: true,
      mode: attested.mode,
      configured: true,
      backend: written.backend,
      updatedAt: written.envelope.updatedAt,
      decision: stored,
      hedera: {
        configured: config.configured,
        network: config.network,
        operatorId: config.operatorId,
        topicId: attested.topicId ?? written.envelope.hederaTopicId ?? null,
        messageId: attested.messageId,
        transactionId: attested.transactionId,
        explorerUrl: hederaExplorerUrl(config.network, attested.messageId),
        topicCreated: attested.topicCreated,
      },
      note: attested.topicCreated
        ? `Save HEDERA_TOPIC_ID=${attested.topicId} on Vercel so later attests reuse this topic.`
        : undefined,
    });
  } catch (error) {
    if (error instanceof AttestationError) {
      const payload: Record<string, unknown> = {
        ok: false,
        error: error.message,
      };
      if (error.status === 503) {
        payload.setup = [...HEDERA_SETUP_STEPS];
        payload.configured = false;
      }
      return NextResponse.json(payload, { status: error.status });
    }
    const decisionMapped = asWriteError(error);
    if (decisionMapped.status !== 500) {
      return NextResponse.json(
        { ok: false, error: decisionMapped.message },
        { status: decisionMapped.status },
      );
    }
    const mapped = asReportWriteError(error);
    return NextResponse.json(
      { ok: false, error: mapped.message },
      { status: mapped.status },
    );
  }
}
