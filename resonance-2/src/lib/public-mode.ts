/**
 * Public mode is still on another branch (PIN tables, migration 017).
 * Replace this function with that branch's server check when it merges.
 * False keeps the floor private.
 */
export function isPublicMode(): boolean {
  return false;
}
