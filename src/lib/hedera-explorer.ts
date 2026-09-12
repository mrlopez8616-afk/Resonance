const ACCOUNT_ID_RE = /^0\.0\.\d+$/;

/** HashScan / explorer link for a stored witness id. Never includes keys. */
export function hederaExplorerUrl(
  network: string,
  messageId: string | null | undefined,
): string | null {
  if (!messageId?.trim()) return null;
  const id = messageId.trim();
  const net = network.trim() || "testnet";
  if (/^https?:\/\//i.test(id)) return id;

  if (/^0\.0\.\d+\/\d+$/.test(id)) {
    const [topicId, sequence] = id.split("/");
    return `https://hashscan.io/${net}/topic/${topicId}/${sequence}`;
  }

  if (ACCOUNT_ID_RE.test(id)) {
    return `https://hashscan.io/${net}/topic/${id}`;
  }

  if (id.includes("@")) {
    const normalized = id.replace("@", "-").replace(/(\d+)\.(\d+)$/, "$1-$2");
    return `https://hashscan.io/${net}/transaction/${normalized}`;
  }

  return `https://hashscan.io/${net}/transaction/${id}`;
}
