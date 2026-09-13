import "server-only";

import { Client, Wallet, type Payment } from "xrpl";
import {
  XRPL_CONNECT_TIMEOUT_MS,
  XRPL_REQUEST_TIMEOUT_MS,
  assertXrplSubmitAllowed,
  formatXrplSubmitError,
  xrplSubmitWsUrls,
  type XrplRuntimeConfig,
} from "./xrpl-config";
import { encodeMemoDataHex } from "./xrpl-memo";
import type { XrplSubmitResult } from "./xrpl-mirror";

/** One drop. Recorder self-payment — not a transfer and not a dollar size. */
export const XRPL_DUST_DROPS = "1";

async function connectXrplClient(wsUrl: string): Promise<Client> {
  const client = new Client(wsUrl, {
    connectionTimeout: XRPL_CONNECT_TIMEOUT_MS,
    timeout: XRPL_REQUEST_TIMEOUT_MS,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(formatXrplSubmitError(new Error("connect() timed out"), wsUrl)),
          );
        }, XRPL_CONNECT_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (client.isConnected()) {
      await client.disconnect().catch(() => undefined);
    }
    throw new Error(formatXrplSubmitError(error, wsUrl));
  } finally {
    if (timer) clearTimeout(timer);
  }
  return client;
}

async function submitOnSocket(
  client: Client,
  wallet: Wallet,
  memo: string,
  wsUrl: string,
): Promise<XrplSubmitResult> {
  try {
    const payment: Payment = {
      TransactionType: "Payment",
      Account: wallet.classicAddress,
      Destination: wallet.classicAddress,
      Amount: XRPL_DUST_DROPS,
      Memos: [
        {
          Memo: {
            MemoData: encodeMemoDataHex(memo),
          },
        },
      ],
    };
    const prepared = await client.autofill(payment);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    const hash =
      typeof result.result.hash === "string" ? result.result.hash : null;
    if (!hash) {
      throw new Error("XRPL submit did not return a transaction hash.");
    }
    const engine =
      "engine_result" in result.result
        ? String(result.result.engine_result)
        : "";
    if (engine && engine !== "tesSUCCESS") {
      throw new Error(`XRPL submit did not succeed (${engine}).`);
    }
    return { txHash: hash };
  } catch (error) {
    throw new Error(formatXrplSubmitError(error, wsUrl));
  } finally {
    if (client.isConnected()) {
      await client.disconnect();
    }
  }
}

export async function submitXrplDustMemo(
  config: XrplRuntimeConfig,
  input: { memo: string },
): Promise<XrplSubmitResult> {
  assertXrplSubmitAllowed(config);
  const seed = config.seed;
  if (!seed) {
    throw new Error("XRPL_SEED is required for a live Testnet submit.");
  }

  let wallet: Wallet;
  try {
    wallet = Wallet.fromSeed(seed);
  } catch {
    throw new Error(
      "XRPL_SEED could not be parsed. Use the Testnet family seed for the dust wallet. Never a Xaman principal seed.",
    );
  }

  if (wallet.classicAddress !== config.account) {
    throw new Error(
      "XRPL_SEED does not match XRPL_ACCOUNT. Use the Testnet dust wallet for the documented classic address — never the Xaman principal.",
    );
  }

  const urls = xrplSubmitWsUrls(config.wsUrl);
  let lastConnectError: Error | null = null;

  for (const wsUrl of urls) {
    let client: Client;
    try {
      client = await connectXrplClient(wsUrl);
    } catch (error) {
      lastConnectError =
        error instanceof Error
          ? error
          : new Error(formatXrplSubmitError(error, wsUrl));
      continue;
    }
    return submitOnSocket(client, wallet, input.memo, wsUrl);
  }

  throw (
    lastConnectError ??
    new Error("Could not connect to XRPL Testnet.")
  );
}
