import { FLOOR_NODES, type FloorNode } from "@/data/floor-nodes";

export const FLOOR_HIDDEN_KEY = "resonance-2.floor-hidden";
export const FLOOR_HIDDEN_EVENT = "resonance-2-floor-hidden";

const CATALOG = new Map(FLOOR_NODES.map((node) => [node.id, node]));

export function catalogNodes(): FloorNode[] {
  return FLOOR_NODES.filter((node) => node.status !== "empty");
}

export function parseHiddenIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (id): id is string =>
        typeof id === "string" && CATALOG.has(id) && CATALOG.get(id)?.status !== "empty",
    );
  } catch {
    return [];
  }
}

export function readHiddenIds(): string[] {
  if (typeof window === "undefined") return [];
  return parseHiddenIds(window.localStorage.getItem(FLOOR_HIDDEN_KEY));
}

export function writeHiddenIds(ids: readonly string[]): void {
  window.localStorage.setItem(FLOOR_HIDDEN_KEY, JSON.stringify([...ids]));
  window.dispatchEvent(new Event(FLOOR_HIDDEN_EVENT));
}

export function subscribeHiddenIds(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(FLOOR_HIDDEN_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(FLOOR_HIDDEN_EVENT, onStoreChange);
  };
}

export function hiddenIdsSnapshot(): string {
  return window.localStorage.getItem(FLOOR_HIDDEN_KEY) ?? "[]";
}

export function hiddenIdsServerSnapshot(): string {
  return "[]";
}

/**
 * Homepage paint list: live faces that are not hidden, plus the one `+` slot.
 * Offline catalog rows stay in the roster and are not painted until they are live.
 */
export function visibleNodes(hiddenIds: readonly string[]): FloorNode[] {
  const hidden = new Set(hiddenIds);
  return FLOOR_NODES.filter((node) => {
    if (node.status === "empty") return true;
    if (node.status === "offline") return false;
    return !hidden.has(node.id);
  });
}

export function removedNodes(hiddenIds: readonly string[]): FloorNode[] {
  const hidden = new Set(hiddenIds);
  return catalogNodes().filter((node) => hidden.has(node.id));
}
