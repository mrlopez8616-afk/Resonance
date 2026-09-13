import "server-only";

import {
  XRPL_REQUEST_TIMEOUT_MS,
  assertXrplSubmitAllowed,
  formatXrplSubmitError,
  isXrplConnectFailure,
  xrplSubmitJsonRpcUrls,
  xrplWsHost,
  type XrplRuntimeConfig,
} from "./xrpl-config";
import {
  XRPL_DUST_DROPS,
  assertSeedMatchesAccount,
  buildUnsignedDustPayment,
  feeDropsFromRpc,
  signXrplPayment,
} from "./xrpl-payment";
import type { XrplSubmitResult } from "./xrpl-mirror";

export { XRPL_DUST_DROPS };

const LAST_LEDGER_OFFSET = 20;

interface JsonRpcEnvelope {
  result?: Record<string, unknown>;
  error?: { message?: string; error?: string };
}

async function xrplJsonRpc(
  url: string,
  method: string,
  params: unknown[],
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params }),
      signal: AbortSignal.timeout(XRPL_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(formatXrplSubmitError(error, url));
  }
  if (!response.ok) {
    throw new Error(
      `XRPL Testnet JSON-RPC HTTP ${response.status} (${xrplWsHost(url)}).`,
    );
  }
  let envelope: JsonRpcEnvelope;
  try {
    envelope = (await response.json()) as JsonRpcEnvelope;
  } catch {
    throw new Error(
      `XRPL Testnet JSON-RPC returned non-JSON (${xrplWsHost(url)}).`,
    );
  }
  if (envelope.error) {
    const message =
      envelope.error.message ||
      envelope.error.error ||
      "XRPL Testnet JSON-RPC error.";
    throw new Error(message);
  }
  const result = envelope.result;
  if (!result || result.status === "error") {
    const message =
      typeof result?.error_message === "string"
        ? result.error_message
        : typeof result?.error === "string"
          ? result.error
          : "XRPL Testnet JSON-RPC error.";
    throw new Error(message);
  }
  return result;
}

async function submitOnJsonRpc(
  url: string,
  seed: string,
  account: string,
  memo: string,
): Promise<XrplSubmitResult> {
  const [accountInfo, feeInfo] = await Promise.all([
    xrplJsonRpc(url, "account_info", [
      { account, ledger_index: "validated" },
    ]),
    xrplJsonRpc(url, "fee", [{}]),
  ]);
  const accountData =
    accountInfo.account_data && typeof accountInfo.account_data === "object"
      ? (accountInfo.account_data as Record<string, unknown>)
      : null;
  const sequence = Number(accountData?.Sequence);
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error("XRPL Testnet account_info did not return a Sequence.");
  }
  const ledgerIndex = Number(
    feeInfo.ledger_current_index ?? accountInfo.ledger_index,
  );
  if (!Number.isInteger(ledgerIndex) || ledgerIndex <= 0) {
    throw new Error("XRPL Testnet fee did not return a ledger index.");
  }

  const payment = buildUnsignedDustPayment({
    account,
    memo,
    sequence,
    feeDrops: feeDropsFromRpc(feeInfo),
    lastLedgerSequence: ledgerIndex + LAST_LEDGER_OFFSET,
  });
  const { txBlob } = signXrplPayment(seed, payment);
  const submitted = await xrplJsonRpc(url, "submit", [{ tx_blob: txBlob }]);
  const engine =
    typeof submitted.engine_result === "string" ? submitted.engine_result : "";
  const txJson =
    submitted.tx_json && typeof submitted.tx_json === "object"
      ? (submitted.tx_json as Record<string, unknown>)
      : {};
  const hash = typeof txJson.hash === "string" ? txJson.hash : null;
  if (!hash) {
    throw new Error("XRPL submit did not return a transaction hash.");
  }
  if (engine && engine !== "tesSUCCESS" && engine !== "terQUEUED") {
    throw new Error(`XRPL submit did not succeed (${engine}).`);
  }
  return { txHash: hash };
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

  const address = assertSeedMatchesAccount(seed, config.account);
  const urls = xrplSubmitJsonRpcUrls(config.wsUrl);
  let lastConnectError: Error | null = null;

  for (const url of urls) {
    try {
      return await submitOnJsonRpc(url, seed, address, input.memo);
    } catch (error) {
      const formatted =
        error instanceof Error
          ? error
          : new Error(formatXrplSubmitError(error, url));
      if (
        !isXrplConnectFailure(formatted) &&
        !/JSON-RPC HTTP|non-JSON/i.test(formatted.message)
      ) {
        throw formatted;
      }
      lastConnectError = formatted;
    }
  }

  throw lastConnectError ?? new Error("Could not reach XRPL Testnet.");
}
