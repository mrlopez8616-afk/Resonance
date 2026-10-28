import { tileFace, type HomeFace } from "@/lib/home-faces";
import {
  CRAWL_WALK_RUN,
  CWR_HREF,
  cwrBuildStatus,
  cwrGroup,
  cwrItems,
  groupHref,
  groupStatus,
  itemHref,
  stageHeadline,
  type CwrGroupId,
} from "@/lib/crawl-walk-run";

export function cwrBuildFace(): HomeFace {
  const summary = cwrBuildStatus();
  return tileFace({
    id: "crawl-walk-run",
    glyph: "build",
    href: CWR_HREF,
    name: "Crawl Walk Run",
    headline: summary.headline,
    status: summary.status,
    live: true,
  });
}

export function cwrGroupCards(): { id: CwrGroupId; face: HomeFace }[] {
  return CRAWL_WALK_RUN.groups.map((group) => {
    const items = cwrItems(group.id);
    return {
      id: group.id,
      face: tileFace({
        id: group.id,
        glyph: "build",
        href: groupHref(group.id),
        name: group.label,
        headline: String(items.length),
        status: groupStatus(items),
        live: group.id === "built",
      }),
    };
  });
}

export function cwrItemCards(group: CwrGroupId): {
  label: string;
  cards: { id: string; face: HomeFace }[];
} {
  const label = cwrGroup(group)?.label ?? group;
  return {
    label,
    cards: cwrItems(group).map((item) => ({
      id: item.id,
      face: tileFace({
        id: item.id,
        glyph: item.glyph,
        href: itemHref(group, item.id),
        name: item.title,
        headline: stageHeadline(item),
        status: item.statusLine,
        live: item.stageMet,
      }),
    })),
  };
}
