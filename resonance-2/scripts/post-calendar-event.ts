/**
 * POST one calendar row with the fills Bearer.
 * Live host requires RESONANCE_SYNC_SECRET. Local/dev with the secret unset stays open.
 */
export async function postCalendarEvent(event: unknown): Promise<void> {
  const secret = process.env.RESONANCE_SYNC_SECRET?.trim() ?? "";
  const url = process.env.CALENDAR_URL?.trim() || "https://resonance3.vercel.app/api/calendar";
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    console.error("CALENDAR_URL must be an absolute URL.");
    process.exit(1);
  }
  if (!secret && host.endsWith("vercel.app")) {
    console.error(
      "Set RESONANCE_SYNC_SECRET. It is the same Bearer as POST /api/fills. Do not prefix it with NEXT_PUBLIC_.",
    );
    process.exit(1);
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret) headers.authorization = `Bearer ${secret}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(event),
  });
  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exit(1);
}
