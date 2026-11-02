import {
  EmptyCard,
  NodeGrid,
  NodeHeader,
  NodeLayout,
  NodeSection,
  NodeSections,
  StatCard,
} from "@/components/node-layout";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { headlineIsEmpty, type NodePart } from "@/lib/node-layout";
import { tileFace, youtubeHomeFace } from "@/lib/home-faces";
import type { YouTubeScreen } from "@/lib/youtube-analytics";
import {
  NOT_CONNECTED,
  YOUTUBE_GEAR,
  YOUTUBE_GEAR_SOURCE,
  gearFields,
  gearHref,
  youtubeHomeLines,
  youtubeParentCards,
  type YouTubeBrickCard,
  type YouTubeChannelFace,
  type YouTubeGear,
} from "@/lib/youtube-node";

export function YouTubeHomeCard({ lines }: { lines?: readonly string[] }) {
  return <NodeFace face={youtubeHomeFace(lines ?? youtubeHomeLines())} />;
}

function parentParts(channel?: YouTubeChannelFace, brick?: YouTubeBrickCard): NodePart[] {
  const channelPart: NodePart = channel?.live ? "live" : channel?.status ? "partial" : "missing";
  const brickPart: NodePart =
    !brick || brick.figure === NOT_CONNECTED ? "missing" : brick.live ? "live" : "partial";
  return [channelPart, brickPart];
}

/** Parent floor. Child cards only. Channel numbers live on /n/youtube/channel. */
export function YouTubeParent({
  brick,
  channel,
  notice,
}: {
  brick?: YouTubeBrickCard;
  channel?: YouTubeChannelFace;
  notice?: string | null;
}) {
  const cards = youtubeParentCards(undefined, brick, channel);
  return (
    <NodeLayout>
      <NodeHeader name="YouTube" parts={parentParts(channel, brick)} backHref="/" />
      {notice ? <p className="node-note">{notice}</p> : null}
      <NodeSections>
        <NodeSection kind="lists">
          <NodeFaceGrid label="YouTube">
            {cards.map((card) => (
              <NodeFace
                key={card.id}
                face={tileFace({
                  id: card.id,
                  glyph: "youtube",
                  href: card.href,
                  name: card.label,
                  headline: card.figure,
                  status: card.lines.join(" · ") || null,
                  live: card.live,
                })}
              />
            ))}
          </NodeFaceGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

type ChannelStats = { subscribers: string; views: string; videos: string };

type ChannelMetric = {
  id: string;
  label: string;
  value: string | null;
  detail: string;
};

function channelMetrics(stats: ChannelStats | null | undefined, screen: YouTubeScreen | null | undefined): ChannelMetric[] {
  const total = (id: string) => screen?.totals.find((row) => row.id === id)?.headline ?? null;
  return [
    {
      id: "subscribers",
      label: "Subscribers",
      value: total("subscribers") ?? stats?.subscribers ?? null,
      detail: "channel",
    },
    {
      id: "views",
      label: "Views",
      value: total("views") ?? stats?.views ?? null,
      detail: "28 days",
    },
    { id: "watch-time", label: "Watch time", value: total("watch-time"), detail: "28 days" },
    { id: "avg-duration", label: "Avg view", value: total("avg-duration"), detail: "28 days" },
    {
      id: "videos",
      label: "Videos posted",
      value: stats?.videos ?? screen?.channelStats.videos ?? null,
      detail: "channel",
    },
  ];
}

function metricParts(publicMode: boolean, metrics: readonly ChannelMetric[]): NodePart[] {
  if (publicMode) return metrics.map(() => "missing");
  return metrics.map((metric) => (headlineIsEmpty(metric.value) ? "missing" : "live"));
}

function TrendBars({ bars, caption }: { bars: YouTubeScreen["trend"]; caption: string }) {
  if (bars.length === 0) return null;
  const width = 640;
  const height = 148;
  const labelY = height - 8;
  const baseline = 112;
  const room = 96;
  const max = Math.max(...bars.map((bar) => bar.views), 1);
  const slot = width / bars.length;
  const described = `${caption}. ${bars[0]?.label ?? ""} ${bars[0]?.views ?? 0} views through ${bars.at(-1)?.label ?? ""} ${bars.at(-1)?.views ?? 0} views`;
  return (
    <div className="home-visual fitness-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Views over 28 days, ${described}`}>
        {bars.map((bar, index) => {
          const barW = Math.min(slot * 0.62, 16);
          const x = index * slot + (slot - barW) / 2;
          const heightPx = Math.max((bar.views / max) * room, bar.views > 0 ? 2 : 1);
          const y = baseline - heightPx;
          const showLabel = index === 0 || index === bars.length - 1;
          return (
            <g key={bar.id}>
              <title>{`${bar.label} ${bar.views} views`}</title>
              <rect x={x} y={y} width={barW} height={heightPx} rx="1.2" className="home-step" />
              {showLabel ? (
                <text x={index * slot + slot / 2} y={labelY} textAnchor="middle" className="home-tick home-tick-compact">
                  {bar.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function VideoTable({ videos }: { videos: YouTubeScreen["videos"] }) {
  return (
    <div className="youtube-table-wrap">
      <table className="youtube-table">
        <thead>
          <tr>
            <th>Video</th>
            <th>Views</th>
            <th>Watch time</th>
            <th>Avg % viewed</th>
            <th>Impressions</th>
            <th>CTR</th>
            <th>Likes</th>
            <th>Comments</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr key={video.videoId}>
              <td className="youtube-video-title">{video.title}</td>
              <td>{video.views}</td>
              <td>{video.watchTime}</td>
              <td>{video.avgPercent}</td>
              <td>{video.impressions}</td>
              <td>{video.ctr}</td>
              <td>{video.likes}</td>
              <td>{video.comments}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Channel numbers, the 28-day trend, and the video table.
 * Public view locks the number cards and does not render the private rows.
 * The screen model has no pull timestamp, so Updated stays off this page.
 */
export function YouTubeChannel({
  stats,
  publicMode = false,
  notice,
  screen = null,
  updatedAt = null,
}: {
  stats?: ChannelStats | null;
  publicMode?: boolean;
  notice?: string | null;
  screen?: YouTubeScreen | null;
  updatedAt?: string | null;
}) {
  const metrics = channelMetrics(publicMode ? null : stats, publicMode ? null : screen);
  const shown = publicMode ? null : screen;
  const trendReady = Boolean(shown && shown.trend.length > 0);
  const videosReady = Boolean(shown && shown.videos.length > 0);
  const setup =
    !publicMode && shown?.connectHref
      ? { href: shown.connectHref, label: shown.connectLabel ?? "Connect" }
      : null;
  const setupIndex = setup ? metrics.findIndex((metric) => headlineIsEmpty(metric.value)) : -1;
  return (
    <NodeLayout>
      <NodeHeader
        name="Channel"
        parts={metricParts(publicMode, metrics)}
        updatedAt={updatedAt}
        backHref="/n/youtube"
      />
      {notice && !publicMode ? <p className="node-note">{notice}</p> : null}
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            {metrics.map((metric, index) => {
              if (publicMode) return <StatCard key={metric.id} label={metric.label} locked />;
              if (headlineIsEmpty(metric.value)) {
                const link = index === setupIndex ? setup : null;
                return (
                  <EmptyCard
                    key={metric.id}
                    label={metric.label}
                    setupHref={link?.href}
                    setupLabel={link?.label}
                  />
                );
              }
              return <StatCard key={metric.id} label={metric.label} value={metric.value} detail={metric.detail} />;
            })}
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="trends" empty={!trendReady}>
          {trendReady && shown ? (
            <NodeGrid>
              <StatCard span="trend" label="28-day trend" detail={shown.trendCaption}>
                <TrendBars bars={shown.trend} caption={shown.trendCaption} />
              </StatCard>
            </NodeGrid>
          ) : null}
        </NodeSection>
        <NodeSection kind="lists" empty={!videosReady}>
          {videosReady && shown ? (
            <NodeGrid>
              <StatCard
                span="list"
                label="Videos"
                detail="Last 28 days. Impressions and CTR stay blank when YouTube does not send them."
              >
                <VideoTable videos={shown.videos} />
              </StatCard>
            </NodeGrid>
          ) : null}
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

export function YouTubeGearList({ gear = YOUTUBE_GEAR }: { gear?: readonly YouTubeGear[] }) {
  const parts: NodePart[] = gear.length > 0 ? ["live"] : ["missing"];
  return (
    <NodeLayout>
      <NodeHeader name="Gear" parts={parts} backHref="/n/youtube" />
      <p className="node-note">{YOUTUBE_GEAR_SOURCE}</p>
      <NodeSections>
        <NodeSection kind="lists" empty={gear.length === 0}>
          {gear.length === 0 ? null : (
            <NodeGrid>
              {gear.map((item) => (
                <StatCard
                  key={item.id}
                  label={item.isNew ? "New" : "Gear"}
                  value={item.name}
                  detail={item.role}
                  href={gearHref(item.id)}
                />
              ))}
            </NodeGrid>
          )}
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

type GearRow = { label: string; value: string; locked: boolean };

function gearRows(item: YouTubeGear, publicMode: boolean): GearRow[] {
  const rows: GearRow[] = [];
  for (const field of gearFields(item, publicMode)) {
    rows.push({ label: field.label, value: field.value, locked: false });
    if (publicMode && field.label === "Acquired") {
      rows.push({ label: "Cost", value: "", locked: true });
    }
  }
  return rows;
}

export function YouTubeGearDetail({ item, publicMode }: { item: YouTubeGear; publicMode: boolean }) {
  const rows = gearRows(item, publicMode);
  const parts: NodePart[] = rows
    .filter((row) => !row.locked)
    .map((row) => (headlineIsEmpty(row.value) ? "missing" : "live"));
  return (
    <NodeLayout>
      <NodeHeader name={item.name} parts={parts} backHref="/n/youtube/gear" />
      {item.isNew ? <p className="node-note">New for the launch</p> : null}
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            {rows.map((row) => {
              if (row.locked) return <StatCard key={row.label} label={row.label} locked />;
              const prose = row.value.length > 28;
              return (
                <StatCard
                  key={row.label}
                  label={row.label}
                  value={prose ? null : row.value}
                  detail={prose ? row.value : null}
                />
              );
            })}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
