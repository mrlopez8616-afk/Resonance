import { NextResponse } from "next/server";
import {
  PRINTER_BODY_LIMIT,
  PRINTER_HEADER,
  parsePrinterSnapshot,
  printerPayloadForStore,
  printerTokenMatches,
} from "@/lib/printer";
import { readPrinterTokenHash, writePrinterSnapshot } from "@/lib/printer-store";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The PC posts the HP supplies JSON a few times a day.
 * Header: `X-Printer-Token`. The value is compared with the sha256 digest
 * stored for the owner. The sync secret and the other bridge tokens are not
 * accepted. A missing or wrong token is 401. An unreadable store is 503.
 * Each post is kept. The node reads the newest row.
 */

function json(status: number, body: { ok: boolean; error?: string }) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > PRINTER_BODY_LIMIT) {
    return json(413, { ok: false, error: "Body is too large." });
  }

  let stored: string | null;
  try {
    stored = await readPrinterTokenHash();
  } catch (error) {
    const reason = isStorageUnavailable(error) ? error.reason : "token lookup failed";
    console.error("printer auth failed", reason);
    return json(503, { ok: false, error: "Printer ingest is not available." });
  }

  const presented = request.headers.get(PRINTER_HEADER)?.trim() ?? "";
  if (!presented || !stored || !printerTokenMatches(presented, stored)) {
    return json(401, { ok: false, error: "Unauthorized." });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  if (raw.length > PRINTER_BODY_LIMIT) {
    return json(413, { ok: false, error: "Body is too large." });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }

  const snapshot = parsePrinterSnapshot(body);
  if (!snapshot) {
    return json(400, { ok: false, error: "A printer supplies list is required." });
  }

  try {
    await writePrinterSnapshot(snapshot, printerPayloadForStore(body));
    return json(200, { ok: true });
  } catch (error) {
    const reason = isStorageUnavailable(error) ? error.reason : "Printer ingest failed.";
    console.error("printer ingest failed", reason);
    return NextResponse.json(
      storageErrorJson({
        message: isStorageUnavailable(error) ? error.message : "Printer ingest failed.",
        reason,
      }),
      { status: isStorageUnavailable(error) ? 503 : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
