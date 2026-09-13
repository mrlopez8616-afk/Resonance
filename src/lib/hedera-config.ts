export const DEFAULT_HEDERA_OPERATOR_ID = "0.0.10506907";
export const DEFAULT_HEDERA_NETWORK = "testnet" as const;

export const HEDERA_SETUP_STEPS = [
  "In Vercel → Settings → Environment Variables, add HEDERA_OPERATOR_KEY for Production (and Preview if you use it). This is the Testnet private key. Never prefix it with NEXT_PUBLIC_. Never paste it into chat or Grok.",
  "Optional: HEDERA_OPERATOR_ID=0.0.10506907 (this is the default), HEDERA_NETWORK=testnet.",
  "After the first successful Attest, copy the returned topic id into HEDERA_TOPIC_ID (0.0.x) and redeploy so every submit uses the same topic.",
  "Redeploy. Then open Decisions and click Attest (Hedera Testnet), or POST /api/attest with the site cookie / Bearer secret.",
  "Wiring fallback without a key: POST { \"id\": \"D-2026-09-11-04\", \"hederaMessageId\": \"0.0.x/1\" } to record a HashScan id by hand.",
] as const;

export type HederaNetwork = "testnet";

export interface HederaHealth {
  configured: boolean;
  network: HederaNetwork;
  operatorId?: string;
  topicId?: string | null;
}

export interface HederaRuntimeConfig {
  network: HederaNetwork;
  operatorId: string;
  operatorKey: string | null;
  topicId: string | null;
  configured: boolean;
  rejectedNetwork: string | null;
}

const ACCOUNT_ID_RE = /^0\.0\.\d+$/;

export function parseHederaAccountId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return ACCOUNT_ID_RE.test(trimmed) ? trimmed : null;
}

export function parseHederaNetwork(value: unknown): HederaNetwork | null {
  if (value == null || value === "") return DEFAULT_HEDERA_NETWORK;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "testnet") return "testnet";
  return null;
}

export function readHederaConfig(
  env: NodeJS.ProcessEnv = process.env,
  persistedTopicId: string | null = null,
): HederaRuntimeConfig {
  const rawNetwork = env.HEDERA_NETWORK?.trim() ?? "";
  const network = parseHederaNetwork(rawNetwork || DEFAULT_HEDERA_NETWORK);
  const operatorId =
    parseHederaAccountId(env.HEDERA_OPERATOR_ID) ?? DEFAULT_HEDERA_OPERATOR_ID;
  const operatorKey = env.HEDERA_OPERATOR_KEY?.trim() || null;
  const envTopic = parseHederaAccountId(env.HEDERA_TOPIC_ID);
  const persisted = parseHederaAccountId(persistedTopicId);
  const topicId = envTopic ?? persisted;
  const rejectedNetwork =
    rawNetwork && !network ? rawNetwork.toLowerCase() : null;

  return {
    network: network ?? DEFAULT_HEDERA_NETWORK,
    operatorId,
    operatorKey,
    topicId,
    configured: Boolean(operatorKey) && !rejectedNetwork,
    rejectedNetwork,
  };
}

export function hederaHealth(
  env: NodeJS.ProcessEnv = process.env,
  persistedTopicId: string | null = null,
): HederaHealth {
  const config = readHederaConfig(env, persistedTopicId);
  return {
    configured: config.configured,
    network: config.network,
    operatorId: config.operatorId,
    topicId: config.topicId,
  };
}

export function hederaNotConfiguredMessage(config: HederaRuntimeConfig): string {
  if (config.rejectedNetwork) {
    return `Hedera ${config.rejectedNetwork} is out of scope. Phase 0.5 is Testnet only. Set HEDERA_NETWORK=testnet.`;
  }
  return "Hedera Testnet submit is not configured. Set HEDERA_OPERATOR_KEY on the server (never NEXT_PUBLIC_, never paste it into chat). See docs/hedera-attestation.md.";
}

export { hederaExplorerUrl } from "./hedera-explorer";
