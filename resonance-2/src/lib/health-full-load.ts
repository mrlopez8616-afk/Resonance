import "server-only";

import { loadApprovalBoard } from "@/lib/approvals-store";
import { loadBankroll } from "@/lib/bankroll-load";
import { BUILD_NODES } from "@/lib/build-tracker";
import { loadBuildView } from "@/lib/build-store";
import { loadCatalystPage } from "@/lib/catalyst-page";
import { loadChainSecurityFeed, loadChainSecurityHome } from "@/lib/chain-security-store";
import { presentControlRoom } from "@/lib/control-room";
import { loadControlHome, loadControlRoom } from "@/lib/control-room-store";
import { CRAWL_WALK_RUN } from "@/lib/crawl-walk-run";
import { loadFinancePage, readFinanceNetWorthSeries } from "@/lib/finance/store";
import { FINANCE_NODES } from "@/lib/finance/view";
import { loadFitnessBundle, loadFitnessNode, type FitnessRead } from "@/lib/fitness-store";
import { FITNESS_NODES } from "@/lib/fitness-board";
import { loadFitnessManual } from "@/lib/fitness-manual-store";
import { loadIdeaBoard } from "@/lib/future-ideas-store";
import {
  assembleHealth,
  betsBits,
  bits,
  botBits,
  buildBits,
  calendarBits,
  controlHomeBits,
  failedBits,
  feedBits,
  fightDeskBits,
  financeBits,
  fitnessBits,
  groupQuoteBits,
  logBits,
  machineBits,
  quoteBits,
  staticBits,
  triggerBits,
  type HealthBits,
  type HealthFullReport,
} from "@/lib/health-report";
import { AI_STOCK_TICKERS } from "@/lib/ai-stocks";
import { EQUITY_FACE_TICKERS, loadEquityQuotes } from "@/lib/equity-price";
import { CRYPTO_HOME_TICKERS } from "@/lib/home-lines";
import { loadLessonsHome, loadLessonPage } from "@/lib/lessons-store";
import { loadMachineHealth } from "@/lib/machine-health-load";
import { ensureXrpTrigger } from "@/lib/price-history";
import { ensureSpotQuotes } from "@/lib/spot-price";
import { loadRoundtableCards, loadRoundtableHome, readFounderThreads } from "@/lib/roundtable-store";
import { isStorageUnavailable } from "@/lib/storage-unavailable";
import { loadBetsForPage } from "@/lib/store-page";
import { readLivePublicMode } from "@/lib/system-public";
import { loadBrickCounts, loadBrickRows } from "@/lib/youtube-bricks-store";

type Settled<T> = { ok: true; value: T } | { ok: false; kind: "unavailable" | "error" };

async function settled<T>(run: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, kind: isStorageUnavailable(error) ? "unavailable" : "error" };
  }
}

function fromSettled<T>(result: Settled<T>, map: (value: T) => HealthBits): HealthBits {
  if (!result.ok) return failedBits(result.kind);
  return map(result.value);
}

function withClock(base: HealthBits, clock: HealthBits | null): HealthBits {
  if (!clock || base.status !== "ok" || clock.reason === "not connected") return base;
  return { ...base, stale: clock.stale, ageSeconds: clock.ageSeconds, reason: clock.reason };
}

function fitnessStamps(read: FitnessRead): (string | null)[] {
  return [
    ...(read.metrics ?? []).flatMap((row) => [row.recordedAt, row.day]),
    ...(read.workouts ?? []).map((row) => row.startedAt),
    ...(read.shortcutWorkouts ?? []).map((row) => row.startTime),
    ...(read.nrcRuns ?? []).flatMap((row) => [row.startTime, row.day]),
  ];
}

function quotePages(
  spotQuotes: Readonly<Record<string, { fetchedAt?: string | null } | null>>,
  equityQuotes: Readonly<Record<string, { fetchedAt?: string | null } | null>>,
  now: Date,
  tiles: Record<string, HealthBits>,
  pages: Record<string, HealthBits>,
) {
  const crypto = CRYPTO_HOME_TICKERS.map((ticker) => quoteBits(spotQuotes[ticker], now));
  const cryptoGroup = groupQuoteBits(crypto);
  tiles.crypto = cryptoGroup;
  pages.crypto = cryptoGroup;
  CRYPTO_HOME_TICKERS.forEach((ticker, index) => {
    const part = crypto[index];
    if (part) pages[`crypto-${ticker.toLowerCase()}`] = part;
  });
  const stocks = AI_STOCK_TICKERS.map((ticker) => quoteBits(equityQuotes[ticker], now));
  const stockGroup = groupQuoteBits(stocks);
  tiles["ai-stocks"] = stockGroup;
  pages["ai-stocks"] = stockGroup;
  AI_STOCK_TICKERS.forEach((ticker, index) => {
    const part = stocks[index];
    if (part) pages[`ai-${ticker.toLowerCase()}`] = part;
  });
}

type HealthLoader = (now: Date) => Promise<HealthFullReport>;

let override: HealthLoader | null = null;

export function setHealthFullLoaderForTests(next: HealthLoader | null) {
  override = next;
}

async function loadHealthFullLive(now: Date): Promise<HealthFullReport> {
  const [
    quotes,
    finance,
    bankroll,
    bets,
    build,
    lessonsHome,
    lessonsPage,
    controlHome,
    controlQuiet,
    controlLive,
    health,
    roundtableHome,
    roundtableCards,
    roundtableThreads,
    chainHome,
    chainFeed,
    fitness,
    manual,
    fitnessNodes,
    trigger,
    catalysts,
    ideas,
    approvals,
    brickCounts,
    brickRows,
    liveMode,
  ] = await Promise.all([
    settled(async () => {
      const [spotQuotes, equityQuotes] = await Promise.all([
        ensureSpotQuotes(["XRP", "SUI"]),
        loadEquityQuotes(EQUITY_FACE_TICKERS),
      ]);
      return { spotQuotes, equityQuotes };
    }),
    settled(() => loadFinancePage(now)),
    settled(() => loadBankroll()),
    settled(() => loadBetsForPage()),
    settled(() => loadBuildView(now)),
    settled(() => loadLessonsHome()),
    settled(() => loadLessonPage()),
    settled(() => loadControlHome(false)),
    settled(() => loadControlRoom({ publicMode: false, probeLive: false, now })),
    settled(() => loadControlRoom({ publicMode: false, probeLive: true, now, quotes: "cache" })),
    settled(() => loadMachineHealth({ publicMode: false, now, quotes: "cache" })),
    settled(() => loadRoundtableHome()),
    settled(() => loadRoundtableCards(false)),
    settled(() => readFounderThreads()),
    settled(() => loadChainSecurityHome(false)),
    settled(() => loadChainSecurityFeed(false)),
    settled(() => loadFitnessBundle()),
    settled(() => loadFitnessManual()),
    Promise.all(
      FITNESS_NODES.filter((node) => node.id !== "manual").map(async (node) => {
        const loaded = await settled(() => loadFitnessNode(node.id));
        return [node.id, loaded] as const;
      }),
    ),
    settled(() => ensureXrpTrigger()),
    settled(() => loadCatalystPage()),
    settled(() => loadIdeaBoard(false, false)),
    settled(() => loadApprovalBoard()),
    settled(() => loadBrickCounts()),
    settled(() => loadBrickRows(false)),
    settled(() => readLivePublicMode()),
  ]);

  const series =
    finance.ok && finance.value.status === "live"
      ? await settled(() => readFinanceNetWorthSeries())
      : null;

  const tiles: Record<string, HealthBits> = {};
  const pages: Record<string, HealthBits> = {};

  if (!quotes.ok) {
    const failed = failedBits(quotes.kind);
    tiles.crypto = failed;
    tiles["ai-stocks"] = failed;
    pages.crypto = failed;
    pages["ai-stocks"] = failed;
    for (const ticker of CRYPTO_HOME_TICKERS) pages[`crypto-${ticker.toLowerCase()}`] = failed;
    for (const ticker of AI_STOCK_TICKERS) pages[`ai-${ticker.toLowerCase()}`] = failed;
  } else {
    quotePages(quotes.value.spotQuotes, quotes.value.equityQuotes, now, tiles, pages);
  }

  const financeFact = fromSettled(finance, (page) =>
    page.status === "live"
      ? financeBits(
          { status: "live", stale: page.stale, storedAt: page.storedAt, asOf: page.snapshot.asOf },
          now,
        )
      : financeBits(page, now),
  );
  tiles.finance = financeFact;
  pages.finance = financeFact;
  for (const node of FINANCE_NODES) {
    if (node.id === "net-worth") continue;
    pages[`finance-${node.id}`] = financeFact;
  }
  pages["finance-net-worth"] = series && !series.ok ? failedBits(series.kind) : financeFact;

  const fight = fromSettled(bankroll, (page) =>
    fightDeskBits(
      {
        bookReady: page.bookFacts !== null,
        ledgerReady: page.ledger !== null,
        seedOnly: page.status === "seed-only",
        stale: page.storageDetail === "stale",
      },
      "tile",
    ),
  );
  tiles["fight-desk"] = fight;
  pages["fight-desk"] = fight;
  pages["fight-bankroll"] = fromSettled(bankroll, (page) =>
    fightDeskBits(
      {
        bookReady: page.bookFacts !== null,
        ledgerReady: page.ledger !== null,
        seedOnly: page.status === "seed-only",
        stale: page.storageDetail === "stale",
      },
      "bankroll",
    ),
  );
  pages.fights = fromSettled(bets, (page) => betsBits(page));

  const buildFact = fromSettled(build, (view) =>
    buildBits({ updatedAt: view.items.map((item) => item.updatedAt), githubFresh: view.githubFresh }, now),
  );
  tiles.build = buildFact;
  pages.build = buildFact;
  for (const node of BUILD_NODES) pages[`build-${node}`] = buildFact;

  const lessonDates = lessonsPage.ok ? lessonsPage.value.cards.map((card) => card.date) : [];
  tiles.lessons = fromSettled(lessonsHome, (card) =>
    card.unavailable ? bits("unavailable", "storage unavailable") : logBits(card.count, lessonDates, now, "no rows"),
  );
  pages.lessons = fromSettled(lessonsPage, (page) =>
    logBits(page.cards.length, page.cards.map((card) => card.date), now, "no rows"),
  );

  const quietFeeds = controlQuiet.ok ? feedBits(presentControlRoom(controlQuiet.value, false).feeds, now) : null;
  tiles.control = withClock(fromSettled(controlHome, (home) => controlHomeBits(home)), quietFeeds);
  const controlFailure = controlLive.ok ? null : failedBits(controlLive.kind);
  const liveView = controlLive.ok ? presentControlRoom(controlLive.value, false) : null;
  pages.control = liveView
    ? liveView.feeds.length > 0
      ? feedBits(liveView.feeds, now)
      : botBits(liveView.agents, now)
    : (controlFailure ?? failedBits("error"));
  pages["control-approvals"] = liveView?.approvals
    ? logBits(
        liveView.approvals.pendingRows.length + liveView.approvals.doneTodayRows.length,
        [...liveView.approvals.pendingRows, ...liveView.approvals.doneTodayRows].map((row) => row.at),
        now,
        "no rows",
      )
    : liveView
      ? bits("unavailable", "not connected")
      : (controlFailure ?? failedBits("error"));
  pages["control-bots"] = liveView ? botBits(liveView.agents, now) : (controlFailure ?? failedBits("error"));
  pages["control-feeds"] = liveView ? feedBits(liveView.feeds, now) : (controlFailure ?? failedBits("error"));

  const healthFact = fromSettled(health, (loaded) =>
    machineBits({ scored: loaded.report.percent !== null, storageDown: loaded.storageDown }),
  );
  tiles.health = healthFact;
  pages.health = healthFact;

  tiles.youtube = staticBits("not connected");
  pages.youtube = fromSettled(brickCounts, () => bits("ok", "loaded"));
  pages["youtube-channel"] = staticBits("not connected");
  pages["youtube-gear"] = staticBits();
  pages["youtube-bricks"] = fromSettled(brickRows, (rows) => logBits(rows.length, [], now, "no rows"));

  tiles.system = staticBits();
  pages.system = staticBits();
  pages["system-live"] = fromSettled(liveMode, () => staticBits());

  const threadStamps = roundtableThreads.ok ? roundtableThreads.value.map((thread) => thread.updatedAt) : [];
  tiles.roundtable = fromSettled(roundtableHome, (card) =>
    card.unavailable ? bits("unavailable", "storage unavailable") : logBits(card.count, threadStamps, now, "no messages yet"),
  );
  pages.roundtable = fromSettled(roundtableCards, (cards) =>
    cards ? logBits(cards.length, threadStamps, now, "no messages yet") : bits("unavailable", "not connected"),
  );

  const incidentDays = chainFeed.ok
    ? chainFeed.value.watches.flatMap((watch) => watch.incidents.map((incident) => incident.occurredOn))
    : [];
  tiles["chain-security"] = fromSettled(chainHome, (card) =>
    card.unavailable
      ? bits("unavailable", "storage unavailable")
      : logBits(card.count, incidentDays, now, "no rows"),
  );
  pages["chain-security"] = fromSettled(chainFeed, (feed) =>
    logBits(
      feed.count,
      feed.watches.flatMap((watch) => watch.incidents.map((incident) => incident.occurredOn)),
      now,
      "no rows",
    ),
  );

  const stamps = fitness.ok ? fitnessStamps(fitness.value) : [];
  pages.fitness = fromSettled(fitness, (read) => fitnessBits(read.availability, fitnessStamps(read), now));
  for (const [id, loaded] of fitnessNodes) {
    pages[`fitness-${id}`] = fromSettled(loaded, (node) => {
      if (!node.detail && node.availability !== "unavailable") return failedBits("error");
      return fitnessBits(node.availability, stamps, now);
    });
  }
  pages["fitness-manual"] = fromSettled(manual, (read) =>
    fitnessBits(
      read.availability,
      read.entries.flatMap((entry) => [entry.createdAt, entry.entryDate]),
      now,
    ),
  );

  pages["crypto-xrp-trigger"] = fromSettled(trigger, (shared) => {
    const age = shared ? now.getTime() - Date.parse(shared.fetchedAt) : Number.NaN;
    return triggerBits(
      Boolean(shared && shared.closes.length > 0),
      Number.isFinite(age) ? { ageMs: Math.max(0, age) } : null,
    );
  });
  pages["ai-catalysts"] = fromSettled(catalysts, (page) => calendarBits(page.store));

  pages.ideas = fromSettled(ideas, (cards) =>
    logBits(cards.length, cards.map((card) => card.addedOn), now, "no rows"),
  );
  pages["crawl-walk-run"] = staticBits();
  for (const group of CRAWL_WALK_RUN.groups) pages[`cwr-${group.id}`] = staticBits();

  pages.approvals = fromSettled(approvals, (board) =>
    logBits(
      board.pending.length + board.done.length,
      [...board.pending, ...board.done].flatMap((row) => [row.createdAt, row.decidedAt]),
      now,
      "no rows",
    ),
  );
  pages["approvals-pending"] = fromSettled(approvals, (board) =>
    logBits(board.pending.length, board.pending.map((row) => row.createdAt), now, "no rows"),
  );
  pages["approvals-done"] = fromSettled(approvals, (board) =>
    logBits(
      board.done.length,
      board.done.flatMap((row) => [row.decidedAt, row.createdAt]),
      now,
      "no rows",
    ),
  );

  return assembleHealth(now.toISOString(), tiles, pages);
}

export async function loadHealthFull(now = new Date()): Promise<HealthFullReport> {
  if (override) return override(now);
  return loadHealthFullLive(now);
}
