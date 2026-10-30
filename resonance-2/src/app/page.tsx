import { ControlHomeCard } from "@/components/control-room";
import { HealthHomeCard } from "@/components/machine-health-floor";
import { YouTubeHomeCard } from "@/components/youtube-node";
import { ChainSecurityHomeCard } from "@/components/chain-security-floor";
import { LessonsHomeCard } from "@/components/lessons-floor";
import { RoundtableHomeCard } from "@/components/roundtable-floor";
import { NodeFaceGrid } from "@/components/node-face";
import { ParentGrid } from "@/components/parent-grid";
import { PublicHomePage } from "@/components/public-home-page";
import { SystemHomeCard } from "@/components/system-map";
import { OperatorShell } from "@/components/operator-shell";
import { ThisWeek } from "@/components/this-week";
import { getSession } from "@/lib/auth-session";
import { bankrollHomeFace } from "@/lib/bankroll";
import { loadFinancePage } from "@/lib/finance/store";
import { financeHomeForRole, type FinanceHomeFace } from "@/lib/finance/view";
import { loadBankroll } from "@/lib/bankroll-load";
import { loadFitnessHome } from "@/lib/fitness-store";
import { EQUITY_FACE_TICKERS } from "@/lib/live-face";
import { CRYPTO_HOME_TICKERS, type HomeMove } from "@/lib/home-lines";
import { loadOperatorFloor } from "@/lib/operator-floor";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { fightLinkTargets } from "@/lib/fight-desk";
import { loadBuildHomeCard } from "@/lib/build-store";
import type { BuildHomeCard } from "@/lib/build-tracker";
import { loadControlHome } from "@/lib/control-room-store";
import { loadMachineHealth } from "@/lib/machine-health-load";
import { loadLessonsHome } from "@/lib/lessons-store";
import type { LessonsHomeModel } from "@/lib/lessons";
import { loadChainSecurityHome } from "@/lib/chain-security-store";
import type { ChainSecurityHomeModel } from "@/lib/chain-security";
import { loadRoundtableHome } from "@/lib/roundtable-store";
import type { RoundtableHomeModel } from "@/lib/roundtable";
import { isPublicMode } from "@/lib/public-mode-server";
import { privateHomeNodeCount } from "@/lib/home-faces";
import { thisWeekItems } from "@/lib/this-week";
import { loadYouTubeHomeLines } from "@/lib/youtube-screen";

export const dynamic = "force-dynamic";

function moveFromQuote(
  ticker: string,
  quote: { change24hPct?: number | null; fetchedAt?: string | null } | null | undefined,
): HomeMove {
  return {
    id: ticker.toLowerCase(),
    ticker,
    changePct: typeof quote?.change24hPct === "number" ? quote.change24hPct : null,
    fetchedAt: quote?.fetchedAt ?? null,
  };
}

const buildHomeFallback: BuildHomeCard = {
  unavailable: true,
  percentLabel: null,
  lines: [],
};

const lessonsHomeFallback: LessonsHomeModel = {
  unavailable: true,
  count: 0,
  latestTitle: null,
};

const roundtableHomeFallback: RoundtableHomeModel = {
  unavailable: true,
  count: 0,
  lines: [],
};

const chainHomeFallback: ChainSecurityHomeModel = {
  unavailable: true,
  count: 0,
  lines: [],
};

export default async function Home() {
  if (await isPublicMode()) return <PublicHomePage />;
  const [floor, fitness, bankroll, calendar, book, session, buildHome, lessonsHome, controlHome, healthHome, roundtableHome, chainHome, youtubeLines] =
    await Promise.all([
    loadOperatorFloor(),
    loadFitnessHome(),
    loadBankroll(),
    loadCalendarForPage(),
    loadBetsForPage(),
    getSession(),
    loadBuildHomeCard().catch((error: unknown) => {
      if (!isStorageUnavailable(error)) throw error;
      return buildHomeFallback;
    }),
    loadLessonsHome().catch((error: unknown) => {
      if (!isStorageUnavailable(error)) throw error;
      return lessonsHomeFallback;
    }),
    loadControlHome(false),
    loadMachineHealth({ publicMode: false }).catch((error: unknown) => {
      if (!isStorageUnavailable(error)) throw error;
      return null;
    }),
    loadRoundtableHome().catch((error: unknown) => {
      if (!isStorageUnavailable(error)) throw error;
      return roundtableHomeFallback;
    }),
    loadChainSecurityHome(false).catch((error: unknown) => {
      if (!isStorageUnavailable(error)) throw error;
      return chainHomeFallback;
    }),
    loadYouTubeHomeLines().catch((error: unknown) => {
      if (!isStorageUnavailable(error)) throw error;
      return null;
    }),
  ]);
  let financeHome: FinanceHomeFace | null = null;
  if (session?.role === "owner") {
    const finance = await loadFinancePage();
    financeHome = financeHomeForRole(
      session.role,
      finance.status === "live" ? finance.snapshot : null,
    );
  }
  const faceTotals = Object.fromEntries(
    Object.entries(floor.faces).map(([ticker, face]) => [ticker, face.totalUsd]),
  );
  const storageMessage =
    floor.storageMessage ??
    (fitness.availability === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null);
  const asOf = new Date();
  const bets = book.status === "unavailable" ? [] : book.bets;
  const moves: HomeMove[] = EQUITY_FACE_TICKERS.map((ticker) =>
    moveFromQuote(ticker, floor.equityQuotes[ticker]),
  );
  const cryptoMoves: HomeMove[] = CRYPTO_HOME_TICKERS.map((ticker) =>
    moveFromQuote(ticker, floor.spotQuotes[ticker]),
  );
  const ledger = bankroll.ledger;

  return (
    <OperatorShell
      storageMessage={storageMessage}
      storageDetail={floor.storageDetail ?? bankroll.storageDetail}
    >
      <ThisWeek items={thisWeekItems(calendar.events, asOf, fightLinkTargets(bets, calendar.events))} />
      <NodeFaceGrid
        count={privateHomeNodeCount({
          owner: session?.role === "owner",
          health: healthHome !== null,
        })}
      >
      <ParentGrid
        faceTotals={faceTotals}
        fightDesk={floor.fightDesk}
        fightDeskAvailability={floor.fightDeskAvailability}
        fitnessLine={fitness.line}
        fitnessWeek={fitness.week}
        bankroll={ledger ? bankrollHomeFace(ledger) : null}
        fightBook={ledger ? null : bankroll.bookFacts}
        moves={moves}
        cryptoMoves={cryptoMoves}
        financeHome={financeHome}
        asOf={asOf.toISOString()}
        buildHome={buildHome}
      />
      <ControlHomeCard lines={controlHome.lines} live={controlHome.live} />
      {session?.role === "owner" && healthHome ? <HealthHomeCard report={healthHome.report} /> : null}
      <YouTubeHomeCard lines={youtubeLines ?? undefined} />
      <SystemHomeCard />
      <LessonsHomeCard card={lessonsHome} />
      {session?.role === "owner" ? <RoundtableHomeCard card={roundtableHome} /> : null}
      {session?.role === "owner" ? <ChainSecurityHomeCard card={chainHome} /> : null}
      </NodeFaceGrid>
    </OperatorShell>
  );
}
