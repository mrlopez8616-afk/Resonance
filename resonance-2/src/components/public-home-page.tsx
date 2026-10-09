import { LessonsHomeCard } from "@/components/lessons-floor";
import { ThisWeek } from "@/components/this-week";
import { PublicHome } from "@/components/public-floor";
import { SystemHomeCard } from "@/components/system-map";
import { OperatorShell } from "@/components/operator-shell";
import { loadBankroll } from "@/lib/bankroll-load";
import { loadBuildHomeCard } from "@/lib/build-store";
import type { BuildHomeCard } from "@/lib/build-tracker";
import { fitnessSecondaryLines, nextAiCatalystLine } from "@/lib/home-lines";
import { loadFitnessHome } from "@/lib/fitness-store";
import { loadLessonsHome } from "@/lib/lessons-store";
import type { LessonsHomeModel } from "@/lib/lessons";
import { loadPublicFloor } from "@/lib/public-load";
import { hasMoneyText, publicHref, publicRecordLabel, stripMoneyText } from "@/lib/public-mode";
import { loadBetsForPage, loadCalendarForPage } from "@/lib/store-page";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { fightLinkTargets } from "@/lib/fight-desk";
import { thisWeekItems } from "@/lib/this-week";

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

function safeLine(line: string): string | null {
  if (hasMoneyText(line)) return null;
  const next = stripMoneyText(line);
  return next || null;
}

export async function PublicHomePage() {
  const [floor, fitness, bankroll, calendar, betsLoaded, buildHome, lessonsHome] = await Promise.all([
    loadPublicFloor(),
    loadFitnessHome(),
    loadBankroll(),
    loadCalendarForPage(),
    loadBetsForPage(),
    loadBuildHomeCard().catch((error: unknown) => {
      if (!isStorageUnavailable(error)) throw error;
      return buildHomeFallback;
    }),
    loadLessonsHome().catch((error: unknown) => {
      if (!isStorageUnavailable(error)) throw error;
      return lessonsHomeFallback;
    }),
  ]);
  const bets = betsLoaded.status === "unavailable" ? [] : betsLoaded.bets;
  const week = thisWeekItems(calendar.events, new Date(), fightLinkTargets(bets, calendar.events))
    .flatMap((item) => {
      const title = safeLine(item.title);
      if (!title) return [];
      return [{ ...item, title, href: publicHref(item.href) }];
    });
  const lines = [
    ...fitnessSecondaryLines(fitness.week, fitness.line),
  ].flatMap((line) => {
    const next = safeLine(line);
    return next ? [next] : [];
  });
  const headline = fitness.line && !hasMoneyText(`${fitness.line.value} ${fitness.line.unit}`)
    ? fitness.line
    : null;
  const storageMessage =
    floor.storageMessage ??
    (fitness.availability === "unavailable" ? STORAGE_UNAVAILABLE_BANNER : null);

  return (
    <OperatorShell storageMessage={storageMessage} storageDetail={floor.storageDetail}>
      <ThisWeek items={week} />
      <PublicHome
        crypto={floor.model.crypto}
        aiStocks={floor.model.aiStocks}
        aiCatalystLine={safeLine(nextAiCatalystLine(calendar.events, new Date()) ?? "")}
        fitness={{
          headline: headline?.value ?? null,
          unit: headline?.unit ?? null,
          lines,
        }}
        fightRecord={publicRecordLabel(bankroll.ledger?.recordLabel)}
        buildHome={{
          ...buildHome,
          lines: buildHome.lines.flatMap((line) => {
            const next = safeLine(line);
            return next ? [next] : [];
          }),
          percentLabel:
            buildHome.percentLabel && hasMoneyText(buildHome.percentLabel)
              ? null
              : buildHome.percentLabel,
        }}
      />
      <SystemHomeCard />
      <LessonsHomeCard
        card={{
          ...lessonsHome,
          latestTitle:
            lessonsHome.latestTitle && hasMoneyText(lessonsHome.latestTitle)
              ? null
              : lessonsHome.latestTitle,
        }}
      />
    </OperatorShell>
  );
}
