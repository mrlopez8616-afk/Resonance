import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { FinanceDetail } from "@/components/finance-detail";
import { FinanceFloor, FinanceWaiting } from "@/components/finance-floor";
import { SYNTHETIC_FINANCE_SNAPSHOT } from "@/lib/finance/fixture";
import type { FinanceSnapshot } from "@/lib/finance/schema";
import { financeCards, financeDetail } from "@/lib/finance/view";

const serverPath = fileURLToPath(
  new URL("../../node_modules/react-dom/cjs/react-dom-server-legacy.node.development.js", import.meta.url),
);
const { renderToStaticMarkup } = createRequire(import.meta.url)(serverPath) as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

const cards = financeCards(SYNTHETIC_FINANCE_SNAPSHOT);
const html = renderToStaticMarkup(
  createElement(FinanceFloor, {
    asOf: SYNTHETIC_FINANCE_SNAPSHOT.asOf,
    stale: false,
    cards,
  }),
);
assert.match(html, /partial/);
assert.equal(html.includes("<li></li>"), false);
assert.equal(html.includes("undefined"), false);
assert.equal(html.includes("$0"), false);

const quiet: FinanceSnapshot = {
  ...SYNTHETIC_FINANCE_SNAPSHOT,
  alerts: [],
  unlinked: [],
  debts: SYNTHETIC_FINANCE_SNAPSHOT.debts
    .filter((item) => item.linked)
    .map((item) => ({ ...item, minPayment: null })),
  coverage: { missing: [] },
};
const quietHtml = renderToStaticMarkup(
  createElement(FinanceFloor, {
    asOf: quiet.asOf,
    stale: false,
    cards: financeCards(quiet),
  }),
);
assert.equal(quietHtml.includes("partial"), false);
assert.equal(quietHtml.includes("not linked"), false);
assert.equal(quietHtml.includes("<li></li>"), false);

const detail = financeDetail(SYNTHETIC_FINANCE_SNAPSHOT, "debt");
assert.ok(detail);
const debtHtml = renderToStaticMarkup(
  createElement(FinanceDetail, {
    detail: detail!,
    asOf: "2026-10-01",
    stale: true,
  }),
);
assert.match(debtHtml, /not linked/);
assert.match(debtHtml, /APR unknown/);
assert.match(debtHtml, /stale/);
assert.equal(debtHtml.includes("$0"), false);

const waiting = renderToStaticMarkup(createElement(FinanceWaiting));
assert.equal(waiting.includes("Waiting for first snapshot"), true);
assert.equal(waiting.includes("$"), false);

console.log("finance render ok");
