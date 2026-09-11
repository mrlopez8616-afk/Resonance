export async function lockAppGate(): Promise<boolean> {
  const response = await fetch("/api/gate", { method: "DELETE" });
  return response.ok;
}
