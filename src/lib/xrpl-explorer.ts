const TX_HASH_RE = /^[A-Fa-f0-9]{64}$/;

/** testnet.xrpl.org link for a stored payment-rail pointer. Never includes seeds. */
export function xrplExplorerUrl(
  network: string,
  txHash: string | null | undefined,
): string | null {
  if (!txHash?.trim()) return null;
  const hash = txHash.trim();
  if (/^https?:\/\//i.test(hash)) return hash;
  const net = network.trim().toLowerCase() || "testnet";
  if (net !== "testnet") return null;
  if (!TX_HASH_RE.test(hash)) {
    return `https://testnet.xrpl.org/transactions/${encodeURIComponent(hash)}`;
  }
  return `https://testnet.xrpl.org/transactions/${hash.toUpperCase()}`;
}
