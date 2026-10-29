/**
 * Nodes taken off the floor. Pages, tables, routes, and APIs stay.
 *
 * The list is empty, so Fitness is on the home floor, the system map, and /tv.
 * The parent is `/n/fitness`. Steps is `/n/fitness/steps`.
 * Add an id here to hide that node again.
 */
export const SHELVED_NODES: readonly string[] = [];

export function nodeShelved(id: string, shelved: readonly string[] = SHELVED_NODES): boolean {
  return shelved.includes(id);
}

/** True when the path is the shelved node or a page under it. */
export function navHrefShelved(href: string, shelved: readonly string[] = SHELVED_NODES): boolean {
  const path = (href.split("?")[0]?.split("#")[0] ?? href).replace(/\/+$/, "") || "/";
  return shelved.some((id) => path === `/n/${id}` || path.startsWith(`/n/${id}/`));
}

export function visibleNavHrefs<T extends { href: string }>(
  items: readonly T[],
  shelved: readonly string[] = SHELVED_NODES,
): T[] {
  return items.filter((item) => !navHrefShelved(item.href, shelved));
}

export function visibleById<T extends { id: string }>(
  rows: readonly T[],
  shelved: readonly string[] = SHELVED_NODES,
): T[] {
  return rows.filter((row) => !nodeShelved(row.id, shelved));
}
