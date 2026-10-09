const RETIRED_CRYPTO_PARENT: Record<string, "crypto"> = {
  hbar: "crypto",
};

/** Old HBAR child URL. The node is gone; history stays on the log. */
export function retiredCryptoNodeHref(parentId: string, nodeId: string): string | null {
  const parent = RETIRED_CRYPTO_PARENT[nodeId];
  if (!parent || parent !== parentId) return null;
  return `/n/${parent}`;
}
