import Link from "next/link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { tileFace, youtubeHomeFace } from "@/lib/home-faces";
import {
  YOUTUBE_GEAR,
  YOUTUBE_GEAR_SOURCE,
  channelStatRows,
  gearFields,
  gearHref,
  youtubeHomeLines,
  youtubeParentCards,
  type YouTubeBrickCard,
  type YouTubeGear,
} from "@/lib/youtube-node";

export function YouTubeHomeCard() {
  return <NodeFace face={youtubeHomeFace(youtubeHomeLines())} />;
}

export function YouTubeParent({ brick }: { brick?: YouTubeBrickCard }) {
  const cards = youtubeParentCards(undefined, brick);
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

export function YouTubeChannel() {
  const rows = channelStatRows();
  return (
    <div className="control-room">
      <header className="log-header">
        <p className="log-kicker">YouTube</p>
        <h2 className="log-title">Channel</h2>
        <p className="log-meta">No channel source is connected yet. Stats stay blank until one is.</p>
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
