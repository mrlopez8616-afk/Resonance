import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/chain-security/route";
import { SESSION_COOKIE } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import {
  LOSS_HIDDEN,
  NO_INCIDENTS_RECORDED,
  SOURCE_PENDING,
  chainSecurityHomeModel,
  founderHoldingChains,
  formatLoss,
  formatUsd,
  parseIncidentWrite,
  presentFeed,
  presentIncident,
  type IncidentRecord,
} from "@/lib/chain-security";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { applyMigrations, migrate } from "@/lib/pg/migrate";
import { proxy } from "@/proxy";
import { PUBLIC_MODE_COOKIE } from "@/lib/public-mode";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = "chain-security-sync-secret";

const cssRequire = createRequire(import.meta.url);
const nodeModule = cssRequire("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = nodeModule._load;
nodeModule._load = function load(request: string, parent: unknown, isMain: boolean) {
  const normalized = request.replace(/\\/g, "/");
  if (normalized === "next/link" || normalized.includes("next/dist/client/link")) {
    return {
      __esModule: true,
      default: function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string; title?: string }) {
        return createElement("a", { href: props.href ?? "", className: props.className, title: props.title }, props.children);
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  const props = node.props as { children?: ReactNode };
  return render(props.children);
}

function envSnapshot() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
    AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
  };
}

function restore(previous: ReturnType<typeof envSnapshot>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function postgres(): Promise<SqlClient> {
  const db = new PGlite();
  async function query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
    const result = await db.query<T>(text, [...params]);
    return result.rows ?? [];
  }
  return {
    query,
    async transaction(statements) {
      const results: Record<string, unknown>[][] = [];
      await query("BEGIN");
      try {
        for (const statement of statements) {
          results.push(await query(statement.text, statement.params ?? []));
        }
        await query("COMMIT");
        return results;
      } catch (error) {
        await query("ROLLBACK");
        throw error;
      }
    },
  };
}

function incident(partial: Partial<IncidentRecord> & Pick<IncidentRecord, "id" | "category" | "subject">): IncidentRecord {
  return {
    occurredOn: null,
    cause: "not recorded",
    loss: { kind: "not_recorded", low: null, high: null },
    status: "not recorded",
    sourceUrl: null,
    exposures: [],
    ...partial,
  };
}

describe("chain security copy", () => {
  it("sorts bridge exploits first and hides dollars in public mode", async () => {
    const { ChainSecurityDetail, ChainSecurityFloor, ChainSecurityHomeCard } = await import(
      "@/components/chain-security-floor"
    );
    assert.equal(formatUsd(730000), "$730K");
    assert.equal(formatUsd(1760000), "$1.76M");
    assert.equal(formatUsd(3800000), "$3.8M");
    assert.equal(formatUsd(102000000), "$102M");
    assert.equal(
      formatLoss({ kind: "range", low: 730000, high: 1760000 }),
      "$730K\u2013$1.76M",
    );
    assert.equal(formatLoss({ kind: "none", low: null, high: null }), "none");
    assert.equal(formatLoss({ kind: "not_recorded", low: null, high: null }), "not recorded");

    const rows = [
      incident({ id: "ledger-cryptobilis", category: "wallet_hardware", subject: "Ledger / CryptoBilis", occurredOn: null }),
      incident({
        id: "xrpl-ai-bug",
        category: "chain_bug",
        subject: "XRPL",
        status: "patched",
        exposures: ["xrpl"],
        loss: { kind: "none", low: null, high: null },
      }),
      incident({
        id: "autheo-theo",
        category: "bridge_exploit",
        subject: "Autheo (THEO), Hyperlane bridge on Base",
        occurredOn: "2026-10-12",
        cause: "119M THEO minted. Token down 92%.",
        loss: { kind: "range", low: 730000, high: 1760000 },
      }),
      incident({
        id: "pirate-chain-arrr",
        category: "chain_bug",
        subject: "Pirate Chain (ARRR)",
        occurredOn: "2026-10-14",
        cause: "Mint bug.",
      }),
      incident({ id: "near-intents", category: "chain_bug", subject: "NEAR Intents", status: "funds returned" }),
    ];
    const feed = presentFeed(rows, false);
    assert.deepEqual(
      feed.groups.flatMap((group) => group.incidents.map((item) => item.id)),
      ["autheo-theo", "pirate-chain-arrr", "near-intents", "xrpl-ai-bug", "ledger-cryptobilis"],
    );
    assert.deepEqual(
      feed.watches.map((watch) => watch.label),
      ["Flare FXRP bridge", "XRP Ledger", "Sui"],
    );
    assert.equal(feed.watches[0]?.incidents.length, 0);
    assert.equal(feed.watches[0]?.id, "flare-fxrp");
    assert.deepEqual(
      feed.watches[1]?.incidents.map((item) => item.id),
      ["xrpl-ai-bug"],
    );
    assert.equal(feed.watches[2]?.incidents.length, 0);
    assert.equal(feed.watches.some((watch) => watch.id === "hedera"), false);
    const xrplCard = feed.groups.flatMap((group) => group.incidents).find((item) => item.id === "xrpl-ai-bug");
    assert.deepEqual(xrplCard?.holdingChains, ["XRP Ledger"]);
    const home = chainSecurityHomeModel(rows, { publicMode: false });
    assert.equal(home.count, 5);
    assert.deepEqual(home.lines, ["XRP Ledger \u00b7 patched", "Pirate Chain (ARRR)"]);
    assert.equal(home.lines.length <= 3, true);

    const shown = presentIncident(rows[2]!, true);
    assert.equal(shown.lossLabel, LOSS_HIDDEN);
    assert.equal(shown.cause.includes("$"), false);
    assert.equal(shown.sourceLabel, SOURCE_PENDING);
    const html = render(createElement(ChainSecurityDetail, { incident: shown }));
    assert.match(html, /hidden/);
    assert.match(html, /source pending/);
    assert.equal(html.includes("$"), false);
    const list = render(createElement(ChainSecurityFloor, { feed: presentFeed(rows, true) }));
    assert.match(list, /My exposure/);
    assert.match(list, /Flare FXRP bridge/);
    assert.match(list, /XRP Ledger/);
    assert.match(list, /Sui/);
    assert.match(list, new RegExp(NO_INCIDENTS_RECORDED));
    assert.match(list, /holding · not recorded · patched/);
    assert.equal(list.includes("Hedera"), false);
    assert.equal(list.includes("$"), false);
    assert.equal(list.includes("119M"), false);
    assert.equal(list.includes("Mint bug"), false);
    const card = render(
      createElement(ChainSecurityHomeCard, { card: chainSecurityHomeModel(rows, { publicMode: true }) }),
    );
    assert.match(card, /Chain Security/);
    assert.equal(card.includes("$"), false);
  });

  it("pins Flare and the XRP Ledger and flags only recorded holding touches", async () => {
    const chains = founderHoldingChains();
    assert.deepEqual(
      chains.map((chain) => chain.id),
      ["flare-fxrp", "xrpl", "sui"],
    );
    assert.equal(chains.some((chain) => /xaman|rh-main/i.test(chain.id + chain.label)), false);

    const ignored = founderHoldingChains({
      XRP: [
        { id: "rh-main", quantity: "587.718" },
        { id: "xaman-principal", quantity: "999" },
      ],
      SUI: [{ id: "rh-main", quantity: "10" }],
      HBAR: [{ id: "rh-agentic", quantity: "0" }],
    });
    assert.deepEqual(
      ignored.map((chain) => chain.id),
      ["flare-fxrp", "xrpl"],
    );

    const hederaHeld = founderHoldingChains({
      XRP: [],
      SUI: [{ id: "coinbase", quantity: "0" }],
      HBAR: [{ id: "rh-agentic", quantity: "1" }],
    });
    assert.deepEqual(
      hederaHeld.map((chain) => chain.id),
      ["flare-fxrp", "xrpl", "hedera"],
    );

    const empty = presentFeed([], false);
    assert.equal(empty.count, 0);
    assert.equal(empty.countLabel, NO_INCIDENTS_RECORDED);
    assert.deepEqual(empty.groups, []);
    assert.deepEqual(
      empty.watches.map((watch) => watch.incidents.length),
      [0, 0, 0],
    );

    const flare = incident({
      id: "flare-note",
      category: "bridge_exploit",
      subject: "FXRP bridge",
      status: "watch",
    });
    const sui = incident({
      id: "sui-note",
      category: "chain_bug",
      subject: "A Sui protocol",
      exposures: ["sui"],
    });
    const suite = incident({
      id: "suite-note",
      category: "wallet_hardware",
      subject: "Hardware suite",
    });
    const hedera = incident({
      id: "hbar-note",
      category: "chain_bug",
      subject: "Hedera topic",
      exposures: ["hedera"],
    });
    const tagged = presentFeed([flare, sui, suite, hedera], false);
    assert.deepEqual(
      tagged.watches.find((watch) => watch.id === "flare-fxrp")?.incidents.map((item) => item.id),
      ["flare-note"],
    );
    assert.deepEqual(
      tagged.watches.find((watch) => watch.id === "sui")?.incidents.map((item) => item.id),
      ["sui-note"],
    );
    assert.equal(tagged.watches.some((watch) => watch.id === "hedera"), false);
    const views = tagged.groups.flatMap((group) => group.incidents);
    assert.deepEqual(views.find((item) => item.id === "flare-note")?.holdingChains, ["Flare FXRP bridge"]);
    assert.deepEqual(views.find((item) => item.id === "sui-note")?.holdingChains, ["Sui"]);
    assert.deepEqual(views.find((item) => item.id === "suite-note")?.holdingChains, []);
    assert.deepEqual(views.find((item) => item.id === "hbar-note")?.holdingChains, []);

    const { ChainSecurityFloor, ChainSecurityDetail } = await import("@/components/chain-security-floor");
    const quiet = presentFeed([], true);
    const html = render(createElement(ChainSecurityFloor, { feed: quiet }));
    assert.match(html, /My exposure/);
    assert.match(html, /Flare FXRP bridge/);
    assert.match(html, /XRP Ledger/);
    assert.match(html, /no incidents recorded/);
    assert.equal(html.includes("Autheo"), false);
    assert.equal(html.includes("Pirate"), false);
    assert.equal(html.includes("$"), false);
    assert.equal(html.includes("rh-main"), false);
    assert.equal(/xaman/i.test(html), false);
    const flagged = presentIncident(sui, true);
    const detail = render(createElement(ChainSecurityDetail, { incident: flagged }));
    assert.match(detail, /Holding/);
    assert.match(detail, /Sui/);
    assert.equal(detail.includes("$"), false);
    const floorSource = readFileSync(path.join(root, "src/components/chain-security-floor.tsx"), "utf8");
    const libSource = readFileSync(path.join(root, "src/lib/chain-security.ts"), "utf8");
    assert.equal(floorSource.includes("NEXT_PUBLIC_"), false);
    assert.equal(floorSource.includes("RESONANCE_SYNC_SECRET"), false);
    assert.equal(floorSource.includes("rh-main"), false);
    assert.equal(/xaman/i.test(floorSource), false);
    assert.equal(libSource.includes("NEXT_PUBLIC_"), false);
    assert.equal(libSource.includes("RESONANCE_SYNC_SECRET"), false);
  });

  it("rejects a made-up source and keeps a null link", () => {
    const missing = parseIncidentWrite({
      id: "example-bridge",
      subject: "Example bridge",
      category: "bridge exploit",
      cause: "A weekly note.",
      source_url: null,
    });
    assert.equal(missing.ok, true);
    if (missing.ok) assert.equal(missing.incident.sourceUrl, null);
    const pending = parseIncidentWrite({
      id: "example-bridge",
      subject: "Example bridge",
      category: "bridge_exploit",
      cause: "A weekly note.",
      source_url: "source pending",
    });
    assert.equal(pending.ok, true);
    if (pending.ok) assert.equal(pending.incident.sourceUrl, null);
    const invented = parseIncidentWrite({
      id: "example-bridge",
      subject: "Example bridge",
      category: "bridge_exploit",
      cause: "A weekly note.",
      source_url: "not a url",
    });
    assert.equal(invented.ok, false);
    const tagged = parseIncidentWrite({
      id: "sui-bridge",
      subject: "Example bridge",
      category: "bridge_exploit",
      cause: "A weekly note.",
      exposures: ["sui"],
    });
    assert.equal(tagged.ok, true);
    if (tagged.ok) assert.deepEqual(tagged.incident.exposures, ["sui"]);
    const principal = parseIncidentWrite({
      id: "example-bridge",
      subject: "Example bridge",
      category: "bridge_exploit",
      cause: "A weekly note.",
      exposures: ["rh-main"],
    });
    assert.equal(principal.ok, false);
  });

  it("opens the owner pages before the feed is read", () => {
    const parent = readFileSync(path.join(root, "src/app/n/chain-security/page.tsx"), "utf8");
    const child = readFileSync(path.join(root, "src/app/n/chain-security/[id]/page.tsx"), "utf8");
    assert.ok(parent.indexOf('await requireRole("owner")') < parent.indexOf("await loadChainSecurityFeed"));
    assert.ok(child.indexOf('await requireRole("owner")') < child.indexOf("await loadChainSecurityIncident"));
    const home = readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
    assert.match(home, /ChainSecurityHomeCard/);
    assert.match(home, /session\?\.role === "owner" \? <ChainSecurityHomeCard/);
    const cabinet = readFileSync(path.join(root, "cabinet/chain-security.md"), "utf8");
    assert.match(cabinet, /POST \/api\/chain-security/);
    assert.match(cabinet, /RESONANCE_SYNC_SECRET/);
    assert.match(cabinet, /source pending/);
  });
});

describe("chain security store", { concurrency: false }, () => {
  const previous = envSnapshot();
  let token = "";
  const file = readFileSync(path.join(root, "db/migrations/030_chain_security.sql"), "utf8");

  before(async () => {
    process.env.DATABASE_URL = "postgres://resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$dummy";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-chain-security-tests";
    process.env.RESONANCE_SYNC_SECRET = SECRET;
    setSqlClientForTests(await postgres());
    await migrate();
    token = await createSession("chain-security-test");
  });

  after(() => {
    setSqlClientForTests(null);
    restore(previous);
  });

  function post(body: unknown, headers: Record<string, string> = {}) {
    return POST(
      new Request("https://resonance3.vercel.app/api/chain-security", {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          "content-type": "application/json",
          authorization: `Bearer ${SECRET}`,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it("embeds migration 030 and seeds five incidents once", async () => {
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "030_chain_security");
    assert.equal(embedded?.sql, file);
    const rows = await sqlQuery<{
      id: string;
      occurred_on: string | Date | null;
      loss_kind: string;
      loss_low: string | number | null;
      loss_high: string | number | null;
      status: string;
      source_url: string | null;
      cause: string;
      category: string;
    }>(
      `SELECT id, occurred_on, loss_kind, loss_low, loss_high, status, source_url, cause, category
       FROM chain_security_incidents ORDER BY id`,
    );
    assert.deepEqual(
      rows.map((row) => row.id),
      ["autheo-theo", "ledger-cryptobilis", "near-intents", "pirate-chain-arrr", "xrpl-ai-bug"],
    );
    const autheo = rows.find((row) => row.id === "autheo-theo");
    assert.equal(autheo?.category, "bridge_exploit");
    assert.equal(autheo?.loss_kind, "range");
    assert.equal(Number(autheo?.loss_low), 730000);
    assert.equal(Number(autheo?.loss_high), 1760000);
    assert.match(autheo?.source_url ?? "", /^https:\/\/publicaml\.org\//);
    const pirate = rows.find((row) => row.id === "pirate-chain-arrr");
    const pirateDay =
      pirate?.occurred_on instanceof Date
        ? pirate.occurred_on.toISOString().slice(0, 10)
        : String(pirate?.occurred_on ?? "").slice(0, 10);
    assert.equal(pirateDay, "2026-10-14");
    assert.equal(pirate?.loss_kind, "not_recorded");
    assert.equal(pirate?.loss_low, null);
    assert.match(pirate?.source_url ?? "", /^https:\/\/www\.cryptotimes\.io\//);
    const ledger = rows.find((row) => row.id === "ledger-cryptobilis");
    assert.equal(ledger?.loss_kind, "amount");
    assert.equal(Number(ledger?.loss_low), 102000000);
    assert.equal(ledger?.occurred_on, null);
    const near = rows.find((row) => row.id === "near-intents");
    assert.equal(near?.status, "funds returned");
    assert.equal(Number(near?.loss_low), 3800000);
    assert.equal(near?.cause, "not recorded");
    const xrpl = rows.find((row) => row.id === "xrpl-ai-bug");
    assert.equal(xrpl?.loss_kind, "none");
    assert.equal(xrpl?.status, "patched");
    assert.match(xrpl?.source_url ?? "", /^https:\/\/xrpl\.org\//);

    await sqlQuery(`UPDATE chain_security_incidents SET subject = 'Autheo edited' WHERE id = 'autheo-theo'`);
    await sqlQuery(`DELETE FROM schema_migrations WHERE id = '030_chain_security'`);
    const again = await applyMigrations([{ id: "030_chain_security", sql: file }]);
    assert.deepEqual(again.applied, ["030_chain_security"]);
    const kept = await sqlQuery<{ subject: string; n: string }>(
      `SELECT subject, (SELECT count(*)::text FROM chain_security_incidents) AS n
       FROM chain_security_incidents WHERE id = 'autheo-theo'`,
    );
    assert.equal(kept[0]?.subject, "Autheo edited");
    assert.equal(kept[0]?.n, "5");
    await sqlQuery(`UPDATE chain_security_incidents SET subject = 'Autheo (THEO), Hyperlane bridge on Base' WHERE id = 'autheo-theo'`);
  });

  it("upserts on the slug and hides loss in public mode", async () => {
    const signedOut = await GET(new Request("https://resonance3.vercel.app/api/chain-security"));
    assert.equal(signedOut.status, 401);

    const cookieWrite = await POST(
      new Request("https://resonance3.vercel.app/api/chain-security", {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${token}`,
        },
        body: JSON.stringify({
          id: "example-bridge",
          subject: "Example bridge",
          category: "bridge_exploit",
          cause: "Cookie cannot write.",
        }),
      }),
    );
    assert.equal(cookieWrite.status, 401);

    const created = await post({
      id: "example-bridge",
      subject: "Example bridge",
      category: "bridge_exploit",
      cause: "Weekly note.",
      occurred_on: "2026-10-16",
      loss_low: 1000,
      status: "active",
      source_url: null,
    });
    assert.equal(created.status, 201);
    const createdBody = (await created.json()) as { created: boolean; incident: { loss: string; source_url: null } };
    assert.equal(createdBody.created, true);
    assert.equal(createdBody.incident.loss, "$1K");
    assert.equal(createdBody.incident.source_url, null);

    const retry = await post({
      id: "example-bridge",
      subject: "Example bridge",
      category: "bridge_exploit",
      cause: "Weekly note, patched.",
      occurred_on: "2026-10-16",
      loss: "none",
      status: "patched",
      source_url: null,
    });
    assert.equal(retry.status, 200);
    const retryBody = (await retry.json()) as { created: boolean; incident: { loss: string; status: string } };
    assert.equal(retryBody.created, false);
    assert.equal(retryBody.incident.loss, "none");
    assert.equal(retryBody.incident.status, "patched");
    const counts = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM chain_security_incidents WHERE id = 'example-bridge'`,
    );
    assert.equal(counts[0]?.n, "1");

    const rejected = await post({
      id: "example-bridge",
      subject: "Example bridge",
      category: "bridge_exploit",
      cause: "No invented link.",
      source_url: "looks-like-a-link",
    });
    assert.equal(rejected.status, 400);
    const still = await sqlQuery<{ cause: string }>(
      `SELECT cause FROM chain_security_incidents WHERE id = 'example-bridge'`,
    );
    assert.equal(still[0]?.cause, "Weekly note, patched.");

    const bearer = await GET(
      new Request("https://resonance3.vercel.app/api/chain-security", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    assert.equal(bearer.status, 200);
    const bearerBody = (await bearer.json()) as {
      exposure: { id: string; label: string; incidents: string[] }[];
      incidents: { id: string; loss: string; holding: boolean; holding_chains: string[] }[];
    };
    assert.deepEqual(
      bearerBody.exposure.map((watch) => watch.id),
      ["flare-fxrp", "xrpl", "sui"],
    );
    assert.equal(bearerBody.exposure[0]?.label, "Flare FXRP bridge");
    assert.equal(bearerBody.exposure[1]?.label, "XRP Ledger");
    assert.deepEqual(bearerBody.exposure[0]?.incidents, []);
    assert.deepEqual(bearerBody.exposure[1]?.incidents, ["xrpl-ai-bug"]);
    const autheo = bearerBody.incidents.find((item) => item.id === "autheo-theo");
    assert.equal(autheo?.loss, "$730K\u2013$1.76M");
    assert.equal(autheo?.holding, false);
    const xrpl = bearerBody.incidents.find((item) => item.id === "xrpl-ai-bug");
    assert.equal(xrpl?.holding, true);
    assert.deepEqual(xrpl?.holding_chains, ["XRP Ledger"]);

    const hidden = await GET(
      new Request("https://resonance3.vercel.app/api/chain-security", {
        headers: { cookie: `${SESSION_COOKIE}=${token}; ${PUBLIC_MODE_COOKIE}=1` },
      }),
    );
    assert.equal(hidden.status, 200);
    const hiddenText = JSON.stringify(await hidden.json());
    assert.match(hiddenText, /"loss":"hidden"/);
    assert.match(hiddenText, /XRP Ledger/);
    assert.match(hiddenText, /no incidents recorded/);
    assert.equal(hiddenText.includes("$"), false);
    assert.equal(hiddenText.includes("730000"), false);
    assert.equal(hiddenText.includes("1760000"), false);
    assert.equal(hiddenText.includes("102000000"), false);
    assert.equal(hiddenText.includes("3800000"), false);
    assert.equal(hiddenText.includes("loss_low"), false);
  });

  it("sends a signed-out chain security page to login", async () => {
    const page = await proxy(new NextRequest("https://resonance3.vercel.app/n/chain-security"));
    assert.equal(page.status, 307);
    assert.match(page.headers.get("location") ?? "", /\/login\?next=%2Fn%2Fchain-security$/);
    const child = await proxy(new NextRequest("https://resonance3.vercel.app/n/chain-security/autheo-theo"));
    assert.match(child.headers.get("location") ?? "", /\/login\?next=%2Fn%2Fchain-security%2Fautheo-theo$/);
  });
});
