import "server-only";

import { YOUTUBE_GEAR } from "@/data/youtube-gear";
import { deriveBuildSections, stepPercent, buildHomeCard } from "@/lib/build-tracker";
import { loadBuildView } from "@/lib/build-store";
import { loadBankroll } from "@/lib/bankroll-load";
import { loadChainSecurityFeed } from "@/lib/chain-security-store";
import { formatControlAge, presentControlRoom } from "@/lib/control-room";
import { loadControlRoom } from "@/lib/control-room-store";
import {
  blankFilmSnapshot,
  filmFeedIdentity,
  filmLine,
  toFilmGear,
  type FilmSnapshot,
} from "@/lib/film-episode";
import { loadIdeaBoard } from "@/lib/future-ideas-store";
import { loadLessonPage } from "@/lib/lessons-store";
import { scoreMachineHealth } from "@/lib/machine-health";
import { SHELVED_NODES } from "@/lib/node-visibility";
import { loadPublicFloor } from "@/lib/public-load";
import { publicRecordLabel } from "@/lib/public-mode";
import { isStorageUnavailable, STORAGE_UNAVAILABLE_BANNER } from "@/lib/storage-unavailable";
import { loadBrickRows } from "@/lib/youtube-bricks-store";
import { brickStatusLabel } from "@/lib/youtube-bricks";

async function loadOr<T>(task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return fallback;
  }
}

/** Public-mode reads for /film. Dollar fields stay in the loaders and are not copied. */
export async function loadFilmSnapshot(now = new Date()): Promise<{
  snapshot: FilmSnapshot;
  storageMessage: string | null;
}> {
  const snapshot = blankFilmSnapshot(SHELVED_NODES);
  const [floor, build, bankroll, control, lessons, chain, ideas, bricks] = await Promise.all([
    loadOr(loadPublicFloor(), null),
    loadOr(loadBuildView(now), null),
    loadOr(loadBankroll(), null),
    loadOr(loadControlRoom({ publicMode: true, probeLive: false, now }), null),
    loadOr(loadLessonPage(), null),
    loadOr(loadChainSecurityFeed(true), null),
    loadOr(loadIdeaBoard(true, false), null),
    loadOr(loadBrickRows(true), null),
  ]);

  if (floor) {
    snapshot.crypto = floor.model.crypto;
    snapshot.aiStocks = floor.model.aiStocks;
  }
  snapshot.fightRecord = publicRecordLabel(
    bankroll?.ledger?.recordLabel ?? bankroll?.bookFacts?.recordLabel ?? null,
  );

  if (build) {
    const card = buildHomeCard(build.items);
    snapshot.buildUnavailable = false;
    snapshot.buildPercent = card.percentLabel;
    snapshot.buildLines = card.lines;
    snapshot.sections = deriveBuildSections(build.items).map((section) => ({
      id: section.id,
      label: section.label,
      percent: section.percent,
      live: section.counts.live,
      inProgress: section.counts.inProgress,
      queued: section.counts.queued,
      items: section.items.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        nextStep: item.nextStep,
        percent: stepPercent(item.steps),
      })),
    }));
  }

  snapshot.ideas = (ideas ?? []).map((idea) => ({
    id: idea.id,
    title: idea.title,
    note: idea.note,
    status: idea.statusLabel,
  }));

  if (control) {
    const view = presentControlRoom(control, true);
    snapshot.controlLive = view.agents.some((agent) => agent.at);
    snapshot.controlLines = view.agents.length === 0 ? [] : [`${view.agents.filter((agent) => agent.at).length} of ${view.agents.length} bots`];
    snapshot.bots = view.agents.flatMap((agent) => {
      const slug = agent.id;
      const name = filmLine(agent.name);
      if (!name) return [];
      return [{ slug, name, line: formatControlAge(agent.at, now) }];
    });
    snapshot.feeds = view.feeds.flatMap((feed) => {
      const named = filmFeedIdentity(feed.id, feed.label);
      if (!named) return [];
      return [{ slug: named.slug, name: named.name, line: `${feed.freshness} · ${formatControlAge(feed.at, now)}` }];
    });
  }

  const health = scoreMachineHealth({
    floor: floor?.model ?? null,
    buildItems: build?.items ?? null,
    control,
    publicMode: true,
    now,
  });
  snapshot.health = {
    percent: health.percent,
    ready: health.ready,
    scores: health.scores.map((score) => ({
      id: score.id,
      label: score.label,
      detail: score.detail,
      percent: score.percent,
    })),
  };

  if (lessons) {
    snapshot.lessonsUnavailable = false;
    snapshot.lessons = lessons.cards.map((card) => ({
      id: card.id,
      title: card.title,
      lesson: card.lesson,
      whatChanged: card.whatChanged,
      why: card.why,
    }));
  }

  if (chain) {
    snapshot.chainUnavailable = false;
    snapshot.incidents = chain.groups.flatMap((group) =>
      group.incidents.map((incident) => ({
        id: incident.id,
        subject: incident.subject,
        category: incident.categoryLabel,
        status: incident.status,
        cause: incident.cause,
        date: incident.dateLabel,
      })),
    );
  }

  snapshot.gear = YOUTUBE_GEAR.map((item) => toFilmGear(item));
  snapshot.bricks = (bricks ?? []).map((brick) => ({
    id: brick.id,
    title: brick.title,
    status: brickStatusLabel(brick.status),
    summary: brick.summary,
    note: brick.note ?? "",
  }));

  const storageMessage = filmLine(floor?.storageMessage ?? (floor ? null : STORAGE_UNAVAILABLE_BANNER));
  return { snapshot, storageMessage };
}
