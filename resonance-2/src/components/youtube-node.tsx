import Link from "next/link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { tileFace, youtubeHomeFace } from "@/lib/home-faces";
import type { YouTubeScreen } from "@/lib/youtube-analytics";
import {
  YOUTUBE_GEAR,
  YOUTUBE_GEAR_SOURCE,
  channelStatRows,
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

export function YouTubeParent({
  brick,
  channel,
}: {
  brick?: YouTubeBrickCard;
  channel?: YouTubeChannelFace;
}) {
  const cards = youtubeParentCards(undefined, brick, channel);
  return (
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
  );
}

export function YouTubeChannel({
  stats,
  publicMode = false,
  notice,
}: {
  stats?: { subscribers: string; views: string; videos: string } | null;
  publicMode?: boolean;
  notice?: string | null;
}) {
  const rows = channelStatRows(publicMode ? null : stats);
  return (
    <div className="control-room">
      <header className="log-header">
        <p className="log-kicker">YouTube</p>
        <h2 className="log-title">Channel</h2>
        <p className="log-meta">
          {publicMode || !stats ? "No channel source is connected yet. Stats stay blank until one is." : "Last 28 days."}
        </p>
        {notice && !publicMode ? <p className="log-meta">{notice}</p> : null}
      </header>
      <ul className="control-list">
        {rows.map((row) => (
          <li key={row.id} className="control-row">
            <div>
              <p className="control-name">{row.label}</p>
              <p className="control-meta">{row.value}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendBars({ bars, caption }: { bars: YouTubeScreen["trend"]; caption: string }) {
  if (bars.length === 0) return <p className="control-meta">not recorded</p>;
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

/** Totals, 28-day trend, and the video table. Omitted entirely in Public view. */
export function YouTubeAnalyticsPanel({ screen }: { screen: YouTubeScreen }) {
  return (
    <section className="youtube-analytics" aria-label="YouTube analytics">
      {screen.skipMessage ? (
        <p className="parent-empty" role="status">
          {screen.skipMessage}
        </p>
      ) : null}
      {screen.notice ? <p className="control-meta">{screen.notice}</p> : null}
      <NodeFaceGrid label="Channel totals">
        {screen.totals.map((total) => (
          <NodeFace
            key={total.id}
            face={tileFace({
              id: total.id,
              glyph: "youtube",
              href: "",
              name: total.name,
              headline: total.headline,
              status: total.status,
              live: total.headline !== "not recorded" && total.headline !== "not connected",
            })}
          />
        ))}
      </NodeFaceGrid>
      <section className="youtube-trend" aria-label="28-day trend">
        <header className="log-header">
          <h2 className="log-title">28-day trend</h2>
          <p className="log-meta">{screen.trendCaption}</p>
        </header>
        <TrendBars bars={screen.trend} caption={screen.trendCaption} />
      </section>
      <section className="youtube-videos" aria-label="Videos">
        <header className="log-header">
          <h2 className="log-title">Videos</h2>
          <p className="log-meta">Last 28 days. Impressions and CTR stay blank when YouTube does not send them.</p>
        </header>
        {screen.videos.length === 0 ? (
          <p className="control-meta">No video rows yet.</p>
        ) : (
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
                {screen.videos.map((video) => (
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
        )}
      </section>
      {screen.connectHref && screen.connectLabel ? (
        <p className="control-link">
          <a href={screen.connectHref}>{screen.connectLabel}</a>
        </p>
      ) : null}
    </section>
  );
}

export function YouTubeGearList({ gear = YOUTUBE_GEAR }: { gear?: readonly YouTubeGear[] }) {
  return (
    <div className="control-room">
      <header className="log-header">
        <p className="log-kicker">YouTube</p>
        <h2 className="log-title">Gear</h2>
        <p className="log-meta">{YOUTUBE_GEAR_SOURCE}</p>
      </header>
      {gear.length === 0 ? (
        <p className="control-meta">No gear listed yet.</p>
      ) : (
        <ul className="control-list">
          {gear.map((item) => (
            <li key={item.id}>
              <Link href={gearHref(item.id)} className="control-row youtube-gear-row">
                <div>
                  <p className="control-name">
                    {item.name}
                    {item.isNew ? <span className="youtube-new"> New</span> : null}
                  </p>
                  <p className="control-meta">{item.role}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function YouTubeGearDetail({ item, publicMode }: { item: YouTubeGear; publicMode: boolean }) {
  const fields = gearFields(item, publicMode);
  return (
    <div className="control-room">
      <header className="log-header">
        <p className="log-kicker">Gear</p>
        <h2 className="log-title">{item.name}</h2>
        {item.isNew ? <p className="log-meta">New for the launch</p> : null}
      </header>
      <ul className="control-list">
        {fields.map((field) => (
          <li key={field.label} className="control-row">
            <div>
              <p className="control-name">{field.label}</p>
              <p className="control-meta">{field.value}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
