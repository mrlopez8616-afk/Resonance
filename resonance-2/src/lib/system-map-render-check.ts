import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SystemHomeCard, SystemMap } from "@/components/system-map";
import { SYSTEM_LENSES } from "@/data/system-map";
import { nodeShelved } from "@/lib/node-visibility";

const SECRET_ENV = [
  "AUTH_PASSWORD_HASH",
  "AUTH_TOTP_SECRET",
  "AUTH_SESSION_SECRET",
  "RESONANCE_SYNC_SECRET",
  "FITNESS_INGEST_TOKEN",
  "GITHUB_TOKEN",
  "DATABASE_URL",
  "BLOB_READ_WRITE_TOKEN",
  "FINANCE_ENC_KEY",
] as const;

const html = [
  ...SYSTEM_LENSES.map((lens) => renderToStaticMarkup(createElement(SystemMap, { lens: lens.id }))),
  renderToStaticMarkup(createElement(SystemHomeCard)),
].join("\n");

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (/\$\d/.test(html)) fail("rendered html contains a dollar amount");

for (const name of SECRET_ENV) {
  const value = process.env[name]?.trim() ?? "";
  if (value.length < 8) continue;
  if (html.includes(value)) fail(`rendered html contains ${name}`);
}

const markers = [
  "XRP treasury",
  "Xaman",
  "GitHub Actions",
  "Build Tracker API",
  "Sophia Luna",
  "AES-256-GCM",
  "Phase 0",
  "9 agents",
  "/n/crypto/xrp",
  "/n/build",
  "/n/system/live",
  ">Live<",
  "Lessons",
  "/n/lessons",
  "/n/health",
  "Future Ideas",
  "/n/ideas",
  "Crawl Walk Run",
  "/n/crawl-walk-run",
];
for (const marker of markers) {
  if (!html.includes(marker)) fail(`missing ${marker}`);
}

if (nodeShelved("fitness") && /href="\/n\/fitness/.test(html)) {
  fail("shelved fitness link is painted");
}
if (!nodeShelved("fitness") && !html.includes('href="/n/fitness"')) {
  fail("restored fitness link is missing");
}

process.stdout.write("ok\n");
