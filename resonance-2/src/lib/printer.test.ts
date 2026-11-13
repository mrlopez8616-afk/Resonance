import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, isValidElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { POST as ingest } from "@/app/api/ingest/printer/route";
import {
  PRINTER_HEADER,
  PRINTER_HEADER_NAME,
  PRINTER_MODEL,
  PRINTER_STALE_MS,
  PRINTER_URL,
  formatInkPercent,
  hashPrinterToken,
  inkGauges,
  parsePrinterSnapshot,
  printerFeedStale,
} from "@/lib/printer";
import { readPrinterPage, savePrinterTokenHash } from "@/lib/printer-store";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS, PRINTER_SQL } from "@/lib/pg/embedded-migrations";
import { migrate } from "@/lib/pg/migrate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const cssRequire = createRequire(import.meta.url);
const nodeModule = cssRequire("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string }) {
  return createElement("a", { href: props.href ?? "", className: props.className }, props.children);
}
const originalLoad = nodeModule._load;
nodeModule._load = function load(request: string, parent: unknown, isMain: boolean) {
  const normalized = request.replace(/\\/g, "/");
  if (normalized.endsWith(".css") || normalized.includes(".module.css")) {
    return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
  }
  if (normalized === "next/link" || normalized.includes("next/dist/client/app-dir/link")) {
    return { __esModule: true, default: LinkStandIn };
  }
  return originalLoad(request, parent, isMain);
};

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  if (typeof type !== "string") return render((node.props as { children?: ReactNode }).children);
  const props = node.props as Record<string, unknown>;
  const attrs: string[] = [];
  for (const key of Object.keys(props).sort()) {
    if (key === "children") continue;
    const value = props[key];
    if (value == null || value === false || typeof value === "function") continue;
    if (typeof value === "object") continue;
    const name = key === "className" ? "class" : key;
    attrs.push(` ${name}="${escapeText(String(value)).replace(/"/g, "&quot;")}"`);
  }
  return `<${type}${attrs.join("")}>${render(props.children as ReactNode)}</${type}>`;
}

function memorySql(): SqlClient {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  return {
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const result = await pool.query(text, [...params]);
      return (result.rows ?? []) as T[];
    },
  };
}

const sample = {
  version: "1.0",
  printerModel: PRINTER_MODEL,
  readAt: "2026-11-04T12:00:00.000Z",
  suppliesList: [
    {
      supplyType: "inkCartridge",
      supplyColorCode: "C",
      percentLifeDisplay: 72,
      levelState: "ok",
      supplyState: "ok",
      selectabilityNumber: "936",
      supportedParts: [{ selectabilityNumber: "936" }],
      approximatePagesRemainingDisplay: 450,
    },
    {
      supplyType: "inkCartridge",
      supplyColorCode: "M",
      percentLifeDisplay: 12,
      levelState: "low",
      supplyState: "ok",
      selectabilityNumber: "936",
    },
    {
      supplyType: "inkCartridge",
      supplyColorCode: "Y",
      percentLifeDisplay: 0,
      levelState: "empty",
      selectabilityNumber: "936",
    },
    {
      supplyType: "inkCartridge",
      supplyColorCode: "K",
      percentLifeDisplay: 88,
      levelState: "ok",
      supportedParts: [{ selectabilityNumber: "936" }],
    },
    {
      supplyType: "printHead",
      supplyColorCode: "CMYK",
      percentLifeDisplay: 96,
      levelState: "ok",
      selectabilityNumber: "6ZA19A",
    },
  ],
};

function post(body: unknown, token: string | null, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...extra };
  if (token) headers[PRINTER_HEADER] = token;
  return ingest(
    new Request(PRINTER_URL, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("printer snapshots", () => {
  const previous = process.env.DATABASE_URL;

  after(() => {
    setSqlClientForTests(null);
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    setSqlClientForTests(memorySql());
    await migrate();
  });

  it("keeps the migration file and the embedded copy identical", () => {
    const file = readFileSync(path.join(root, "db/migrations/047_printer.sql"), "utf8");
    assert.equal(PRINTER_SQL, file);
    assert.equal(EMBEDDED_MIGRATIONS.at(-4)?.id, "047_printer");
    assert.equal(file.includes("INSERT"), false);
  });

  it("parses ink cartridges and leaves the print head off the gauges", () => {
    const parsed = parsePrinterSnapshot(sample);
    assert.equal(parsed?.printerModel, PRINTER_MODEL);
    assert.equal(parsed?.supplies.length, 5);
    const gauges = inkGauges(parsed?.supplies ?? []);
    assert.deepEqual(
      gauges.map((row) => [row.label, row.percent, row.state, row.buy]),
      [
        ["Cyan", 72, "ok", "HP 936"],
        ["Magenta", 12, "low", "HP 936"],
        ["Yellow", 0, "depleted", "HP 936"],
        ["Black", 88, "ok", "HP 936"],
      ],
    );
    assert.equal(formatInkPercent(72), "72%");
    assert.equal(parsePrinterSnapshot({ suppliesList: [] }), null);
    assert.equal(parsePrinterSnapshot({ suppliesList: [{ supplyType: "printHead", supplyColorCode: "CMYK" }] }), null);
    const now = Date.parse("2026-11-04T12:00:00.000Z");
    assert.equal(printerFeedStale(new Date(now - 60_000).toISOString(), now), false);
    assert.equal(printerFeedStale(new Date(now - PRINTER_STALE_MS - 1000).toISOString(), now), true);
  });

  it("rejects a bad token, keeps history, and does not store a token field", async () => {
    assert.equal((await post(sample, null)).status, 401);
    assert.equal((await post(sample, "not-the-token")).status, 401);
    const token = "printer-bridge-token";
    await savePrinterTokenHash(hashPrinterToken(token));
    assert.equal((await post(sample, "other-token")).status, 401);
    assert.equal((await post("{", token)).status, 400);

    const first = await post({ ...sample, token: "should-not-stick" }, token);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { ok: true });
    const second = await post(
      {
        ...sample,
        readAt: "2026-11-04T18:00:00.000Z",
        suppliesList: sample.suppliesList.map((row) =>
          row.supplyColorCode === "C" ? { ...row, percentLifeDisplay: 40 } : row,
        ),
      },
      token,
    );
    assert.equal(second.status, 200);

    const count = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM printer_snapshots`);
    assert.equal(count[0]?.n, "2");
    const stored = await sqlQuery<{ payload: string }>(`SELECT payload::text AS payload FROM printer_snapshots`);
    assert.equal(JSON.stringify(stored).includes(token), false);
    assert.equal(JSON.stringify(stored).includes("should-not-stick"), false);
    const hash = await sqlQuery<{ token_hash: string }>(`SELECT token_hash FROM printer_tokens WHERE id = 1`);
    assert.equal(hash[0]?.token_hash, hashPrinterToken(token));
    assert.equal(JSON.stringify(hash).includes(token), false);

    const page = await readPrinterPage(Date.parse("2026-11-04T18:30:00.000Z"));
    assert.equal(page.stale, false);
    assert.equal(page.latest?.supplies.find((row) => row.color === "C")?.percent, 40);
    const old = await readPrinterPage(Date.parse("2026-11-05T19:00:00.000Z"));
    assert.equal(old.stale, true);
  });

  it("paints four gauges, the model, and a stale flag after 24 hours", async () => {
    const { PrinterFloor } = await import("@/components/printer-floor");
    const { PrinterGuide } = await import("@/components/printer-guide");
    const guide = render(createElement(PrinterGuide));
    assert.match(guide, new RegExp(PRINTER_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(guide, new RegExp(PRINTER_HEADER_NAME));
    assert.equal(guide.includes("printer-bridge-token"), false);
    const latest = {
      id: "2",
      printerModel: PRINTER_MODEL,
      readAt: "2026-11-04T12:00:00.000Z",
      receivedAt: "2026-11-04T12:00:00.000Z",
      shownAt: "2026-11-04T12:00:00.000Z",
      version: "1.0",
      supplies: parsePrinterSnapshot(sample)?.supplies ?? [],
    };
    const fresh = render(createElement(PrinterFloor, { latest, stale: false, unavailable: false }));
    assert.match(fresh, new RegExp(PRINTER_MODEL));
    assert.match(fresh, /72%/);
    assert.match(fresh, /Cyan/);
    assert.match(fresh, /Magenta/);
    assert.match(fresh, /low/);
    assert.match(fresh, /Yellow/);
    assert.match(fresh, /depleted/);
    assert.match(fresh, /Black/);
    assert.match(fresh, /HP 936/);
    assert.match(fresh, /aria-valuenow="72"/);
    assert.equal(fresh.includes("printHead"), false);
    assert.equal(fresh.includes("Stale"), false);
    const stale = render(createElement(PrinterFloor, { latest, stale: true, unavailable: false }));
    assert.match(stale, /No reading in the last 24 hours/);
    const empty = render(createElement(PrinterFloor, { latest: null, stale: false, unavailable: false }));
    assert.match(empty, new RegExp(PRINTER_MODEL));
    assert.match(empty, /Connect to see data/);
    assert.equal(empty.includes("72%"), false);
  });
});
