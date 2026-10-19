import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { annotateDeskFights, parseBreakdownBody, resolveFightView } from "@/lib/fight-breakdowns";
import {
  NOT_RECORDED,
  presentSubmissionValue,
  submissionBoards,
  submissionStatMap,
} from "@/lib/fight-submission";
import type { Bet } from "@/lib/bets";

const nodeRequire = createRequire(import.meta.url);
const nodeModule = nodeRequire("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = nodeModule._load;
nodeModule._load = function load(request: string, parent: unknown, isMain: boolean) {
  const normalized = request.replace(/\\/g, "/");
  if (
    normalized === "next/link" ||
    normalized.endsWith("/link.js") ||
    normalized.endsWith("/link.react-server.js") ||
    normalized.includes("/app-dir/link") ||
    normalized.includes("next/dist/client/link")
  ) {
    return {
      __esModule: true,
      default: function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string }) {
        return createElement("a", { href: props.href ?? "", className: props.className }, props.children);
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
  const props = node.props as { children?: ReactNode; className?: string };
  const className = typeof props.className === "string" ? `${props.className} ` : "";
  const body =
    typeof type === "function"
      ? render((type as (props: unknown) => ReactNode)(props))
      : render(props.children);
  return `${className}${body}`;
}

describe("submission stats", () => {
  it("keeps a posted zero and drops a blank, a dollar, and a missing field", () => {
    assert.equal(presentSubmissionValue(0, "Times submitted"), "0");
    assert.equal(presentSubmissionValue("", "Times submitted"), null);
    assert.equal(presentSubmissionValue("n/a", "Control time"), null);
    assert.equal(presentSubmissionValue("$2.11", "Control time"), null);
    assert.equal(presentSubmissionValue("2:11", "Control time"), "2:11");
    const mapped = submissionStatMap({
      wins_sub: 4,
      loss_sub: 0,
      tdacc: 45,
      control: "2:11",
    });
    assert.equal(mapped["Sub wins"], "4");
    assert.equal(mapped["Times submitted"], "0");
    assert.equal(mapped["TD accuracy"], "45%");
    assert.equal(mapped["Control time"], "2:11");
    assert.equal(mapped["Sub win %"], undefined);
    assert.equal(mapped["Takedowns/15 min"], undefined);
  });

  it("computes sub win % only from posted win counts", () => {
    const full = submissionStatMap({ wins_ko: 5, wins_sub: 4, wins_dec: 2 });
    assert.equal(full["Sub wins"], "4");
    assert.equal(full["Sub win %"], "36.4%");
    const explicit = submissionStatMap({ wins_sub: 4, sub_win_pct: "40%" });
    assert.equal(explicit["Sub win %"], "40%");
    const missing = submissionStatMap({ wins_sub: 4 });
    assert.equal(missing["Sub win %"], undefined);
  });

  it("stores UFC 333 opponent lines and leaves the rest unrecorded", async () => {
    const [row] = parseBreakdownBody({
      event: "UFC 333",
      fights: {
        "1": {
          fightSlug: "alpha-vs-bravo",
          lean: "Alpha",
          boutOrder: 1,
          opponent: { tdDef: "62%" },
        },
      },
      data: [
        {
          n: 1,
          slot: "2026-10-24",
          card: "Main card",
          A: { name: "Alpha", record: "10-1" },
          B: {
            name: "Bravo",
            wins_ko: 5,
            wins_sub: 4,
            wins_dec: 2,
            loss_sub: 1,
            subavg: 1.4,
            tdacc: "45%",
            control: "2:11",
            r1_finishes: "1 of 8",
          },
        },
      ],
    });
    assert.ok(row);
    assert.equal(row.eventSlug, "ufc-333");
    assert.equal(row.slot, "2026-10-24");
    assert.equal(row.stats?.b["Sub wins"], "4");
    assert.equal(row.stats?.b["Sub win %"], "36.4%");
    assert.equal(row.stats?.b["Times submitted"], "1");
    assert.equal(row.stats?.b["Sub attempts/15 min"], "1.4");
    assert.equal(row.stats?.b["Takedowns/15 min"], undefined);
    assert.equal(row.stats?.b["TD accuracy"], "45%");
    assert.equal(row.stats?.b["TD defense"], "62%");
    assert.equal(row.stats?.b["Control time"], "2:11");
    assert.equal(row.stats?.b["Sub wins"], "4");
    assert.equal(row.stats?.a["Sub wins"], undefined);
    assert.equal(row.stats?.a["Times submitted"], undefined);

    const again = parseBreakdownBody({
      event: "UFC 333",
      fights: {
        "1": {
          fightSlug: "alpha-vs-bravo",
          lean: "Alpha",
          boutOrder: 1,
          opponent: { tdDef: "62%" },
        },
      },
      data: [
        {
          n: 1,
          slot: "2026-10-24",
          card: "Main card",
          A: { name: "Alpha", record: "10-1" },
          B: {
            name: "Bravo",
            wins_ko: 5,
            wins_sub: 4,
            wins_dec: 2,
            loss_sub: 1,
            subavg: 1.4,
            tdacc: "45%",
            control: "2:11",
            r1_finishes: "1 of 8",
          },
        },
      ],
    })[0];
    assert.deepEqual(again, row);

    const boards = submissionBoards({
      aName: row.aName,
      bName: row.bName,
      lean: row.lean,
      aStats: row.stats?.a,
      bStats: row.stats?.b,
    });
    assert.equal(boards.length, 1);
    assert.equal(boards[0]?.name, "Bravo");
    assert.equal(boards[0]?.role, "opponent");
    const byLabel = new Map(boards[0]?.stats.map((stat) => [stat.label, stat.value]));
    assert.equal(byLabel.get("Sub wins"), "4");
    assert.equal(byLabel.get("Sub win %"), "36.4%");
    assert.equal(byLabel.get("Times submitted"), "1");
    assert.equal(byLabel.get("TD defense"), "62%");
    assert.equal(byLabel.get("Control time"), "2:11");
    assert.equal(byLabel.get("Sub attempts/15 min"), "1.4");
    assert.equal([...byLabel.values()].includes("0"), false);

    const fights = annotateDeskFights(
      [
        {
          slug: "alpha-vs-bravo",
          title: "Alpha vs Bravo",
          kicker: "",
          detail: "",
          segment: "main-card",
          bets: [],
        },
      ],
      "ufc-333",
      [row],
    );
    assert.equal(fights[0]?.submission?.[0]?.name, "Bravo");
    assert.equal(
      fights[0]?.submission?.[0]?.stats.find((stat) => stat.label === "TD defense")?.value,
      "62%",
    );

    const view = resolveFightView({
      eventSlug: "ufc-333",
      fightSlug: "alpha-vs-bravo",
      breakdowns: [row],
      bets: [],
    });
    assert.equal(view.status, "ready");
    if (view.status !== "ready") return;
    const opponent = view.fight.B.stats;
    assert.equal(opponent.find((stat) => stat.label === "Sub wins")?.value, "4");
    assert.equal(opponent.find((stat) => stat.label === "Control time")?.value, "2:11");
    assert.equal(view.fight.A.stats.find((stat) => stat.label === "Sub wins")?.value, NOT_RECORDED);
    assert.equal(view.fight.A.stats.find((stat) => stat.label === "KO%")?.value, "n/a");

    const { ListedFightEvent, FightDetail } = await import("@/components/fight-board");
    const eventHtml = render(
      createElement(ListedFightEvent, {
        title: "UFC 333",
        meta: "Oct 24",
        fights,
        bets: [] as Bet[],
        results: [],
        eventSlug: "ufc-333",
        backHref: "/fights/ufc",
        backLabel: "UFC",
      }),
    );
    assert.match(eventHtml, /node-face/);
    assert.match(eventHtml, /Opponent · Bravo/);
    assert.match(eventHtml, /Sub wins/);
    assert.match(eventHtml, /36\.4%/);
    assert.match(eventHtml, /2:11/);
    assert.match(eventHtml, /not recorded/);
    assert.doesNotMatch(eventHtml, /\$/);

    const fightHtml = render(
      createElement(FightDetail, {
        fight: view.fight,
        bets: [],
        backHref: "/fights/ufc-333",
        backLabel: "UFC 333",
        hideEmpty: true,
      }),
    );
    assert.match(fightHtml, /node-face/);
    assert.match(fightHtml, /KO%/);
    assert.match(fightHtml, /R1 finishes/);
    assert.match(fightHtml, /Sub attempts\/15 min/);
    assert.match(fightHtml, /not recorded/);
    assert.match(fightHtml, /2:11/);
    assert.doesNotMatch(fightHtml, /\$/);
  });
});
