export const DEFAULT_XRPL_ACCOUNT = "r4oZhE86dHD4kj1BJWdfmt1xfPNrn6xxd7";
export const DEFAULT_XRPL_NETWORK = "testnet" as const;
export const DEFAULT_XRPL_WS_URL = "wss://s.altnet.rippletest.net:51233";

/** Known public Testnet websockets. Never Mainnet. Tried in order after XRPL_WS_URL. */
export const XRPL_TESTNET_WS_FALLBACKS = [
  DEFAULT_XRPL_WS_URL,
  "wss://testnet.xrpl-labs.com",
] as const;

export const XRPL_CONNECT_TIMEOUT_MS = 15_000;
export const XRPL_REQUEST_TIMEOUT_MS = 25_000;

export const XRPL_SETUP_STEPS = [
  "In Vercel → Settings → Environment Variables, add XRPL_SEED for Production (and Preview if you use it). This is the Testnet family seed for the dust wallet only — never the Xaman principal. Never prefix it with NEXT_PUBLIC_. Never paste it into chat or Grok.",
  "Optional: XRPL_ACCOUNT=r4oZhE86dHD4kj1BJWdfmt1xfPNrn6xxd7 (this is the default), XRPL_NETWORK=testnet.",
  "Optional: XRPL_WS_URL if you need a different Testnet websocket. Default is wss://s.altnet.rippletest.net:51233.",
  "Redeploy. Then open a hashgraph_attested Decision and click Mirror on XRPL Testnet, or POST /api/xrpl-mirror { \"id\" } with the site cookie / Bearer secret.",
  "Wiring fallback without a seed: POST { \"id\": \"D-2026-09-11-04\", \"xrplTxHash\": \"<testnet-tx-hash>\" } to record a testnet.xrpl.org hash by hand.",
] as const;

export type XrplNetwork = "testnet";

export interface XrplHealth {
  configured: boolean;
  network: XrplNetwork;
  account?: string;
}

export interface XrplRuntimeConfig {
  network: XrplNetwork;
  account: string;
  seed: string | null;
  wsUrl: string;
  configured: boolean;
  rejectedNetwork: string | null;
}

/** Classic r-address. Public Testnet dust wallet only — not a seed. */
const CLASSIC_ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

export function parseXrplClassicAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return CLASSIC_ADDRESS_RE.test(trimmed) ? trimmed : null;
}

export function parseXrplNetwork(value: unknown): XrplNetwork | null {
  if (value == null || value === "") return DEFAULT_XRPL_NETWORK;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "testnet") return "testnet";
  return null;
}

export function xrplWsHost(url: string): string {
  try {
    return new URL(url).host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

export function looksLikeXrplMainnetWs(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/testnet|altnet|rippletest/.test(host)) return false;
    return (
      host === "s1.ripple.com" ||
      host === "s2.ripple.com" ||
      host === "xrplcluster.com" ||
      host === "xrpl.ws" ||
      /(^|\.)ripple\.com$/.test(host)
    );
  } catch {
    return false;
  }
}

export function parseXrplWsUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_XRPL_WS_URL;
  const trimmed = value.trim();
  if (!/^wss:\/\//i.test(trimmed)) return DEFAULT_XRPL_WS_URL;
  if (looksLikeXrplMainnetWs(trimmed)) return DEFAULT_XRPL_WS_URL;
  return trimmed;
}

export function xrplSubmitWsUrls(preferred: string): string[] {
  const urls: string[] = [];
  const add = (url: string) => {
    if (!/^wss:\/\//i.test(url) || looksLikeXrplMainnetWs(url)) return;
    if (!urls.includes(url)) urls.push(url);
  };
  add(preferred);
  for (const fallback of XRPL_TESTNET_WS_FALLBACKS) add(fallback);
  return urls.length > 0 ? urls : [DEFAULT_XRPL_WS_URL];
}

export function isXrplConnectFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|econn|enotfound|enetunreach|socket|websocket|connect|disconnect|network|not synced|noNetwork/i.test(
    message,
  );
}

export function formatXrplSubmitError(error: unknown, wsUrl: string): string {
  const host = xrplWsHost(wsUrl);
  const raw = error instanceof Error ? error.message : "XRPL Testnet submit failed.";
  if (/timeout|timed out/i.test(raw)) {
    return `XRPL Testnet websocket timed out (${host}).`;
  }
  if (isXrplConnectFailure(error)) {
    return `Could not connect to XRPL Testnet (${host}).`;
  }
  return raw;
}

export function readXrplConfig(
  env: NodeJS.ProcessEnv = process.env,
): XrplRuntimeConfig {
  const rawNetwork = env.XRPL_NETWORK?.trim() ?? "";
  const network = parseXrplNetwork(rawNetwork || DEFAULT_XRPL_NETWORK);
  const account =
    parseXrplClassicAddress(env.XRPL_ACCOUNT) ?? DEFAULT_XRPL_ACCOUNT;
  const seed = env.XRPL_SEED?.trim() || null;
  const wsUrl = parseXrplWsUrl(env.XRPL_WS_URL);
  const rejectedNetwork =
    rawNetwork && !network ? rawNetwork.toLowerCase() : null;

  return {
    network: network ?? DEFAULT_XRPL_NETWORK,
    account,
    seed,
    wsUrl,
    configured: Boolean(seed) && !rejectedNetwork,
    rejectedNetwork,
  };
}

export function xrplHealth(env: NodeJS.ProcessEnv = process.env): XrplHealth {
  const config = readXrplConfig(env);
  return {
    configured: config.configured,
    network: config.network,
    account: config.account,
  };
}

export function xrplNotConfiguredMessage(config: XrplRuntimeConfig): string {
  if (config.rejectedNetwork) {
    return `XRPL ${config.rejectedNetwork} is out of scope. Phase 0.5 is Testnet only. Set XRPL_NETWORK=testnet.`;
  }
  return "XRPL Testnet mirror is not configured. Set XRPL_SEED on the server (never NEXT_PUBLIC_, never paste it into chat). See docs/xrpl-mirror.md.";
}

export function assertXrplSubmitAllowed(config: XrplRuntimeConfig): void {
  if (config.rejectedNetwork || config.network !== "testnet") {
    throw new Error("Phase 0.5 is XRPL Testnet only. Mainnet submit is rejected.");
  }
  if (!config.seed) {
    throw new Error("XRPL_SEED is required for a live Testnet submit.");
  }
}

export { xrplExplorerUrl } from "./xrpl-explorer";
