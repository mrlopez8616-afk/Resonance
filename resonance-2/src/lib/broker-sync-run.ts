import "server-only";

import { readCoinbaseCredentials } from "@/lib/coinbase-portfolio";
import {
  brokerSyncResponse,
  readRobinhoodCredentials,
  type BrokerSyncView,
  type BrokerVenue,
} from "@/lib/broker-sync";
import { readCoinbaseSnapshot } from "@/lib/broker-sync-coinbase";
import { readRobinhoodSnapshot } from "@/lib/broker-sync-robinhood";
import { readBrokerSyncView, saveBrokerSnapshot, saveBrokerStatus } from "@/lib/broker-sync-store";

export type BrokerSyncRun = {
  ok: true;
  body: ReturnType<typeof brokerSyncResponse>;
  view: BrokerSyncView;
};

async function runVenue(
  venue: BrokerVenue,
  configured: boolean,
  read: () => Promise<Awaited<ReturnType<typeof readCoinbaseSnapshot>>>,
  now: Date,
): Promise<void> {
  if (!configured) {
    await saveBrokerStatus({
      venue,
      status: "not_configured",
      checkedAt: now.toISOString(),
      message: "not configured",
    });
    return;
  }
  try {
    const snapshot = await read();
    await saveBrokerSnapshot(venue, snapshot, now);
  } catch {
    console.error(`${venue} read failed`);
    await saveBrokerStatus({
      venue,
      status: "error",
      checkedAt: now.toISOString(),
      message: "read failed",
    });
  }
}

/** Pull both brokers. Missing keys are recorded as not configured. No order is placed. */
export async function runScheduledBrokerSync(input?: {
  now?: Date;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<BrokerSyncRun> {
  const now = input?.now ?? new Date();
  const env = input?.env ?? process.env;
  const fetchImpl = input?.fetchImpl ?? fetch;
  const coinbase = readCoinbaseCredentials(env);
  const robinhood = readRobinhoodCredentials(env);
  await runVenue(
    "coinbase",
    coinbase !== null,
    () => readCoinbaseSnapshot({ credentials: coinbase!, fetchImpl }),
    now,
  );
  await runVenue(
    "robinhood",
    robinhood !== null,
    () =>
      readRobinhoodSnapshot({
        credentials: robinhood!,
        fetchImpl,
        nowSeconds: Math.floor(now.getTime() / 1000),
      }),
    now,
  );
  const view = await readBrokerSyncView(now, env);
  return { ok: true, body: brokerSyncResponse(view), view };
}
