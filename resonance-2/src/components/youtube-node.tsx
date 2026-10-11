import Link from "next/link";
import { NodeSquare } from "@/components/node-square";
import {
  YOUTUBE_GEAR,
  YOUTUBE_GEAR_SOURCE,
  YOUTUBE_HREF,
  channelStatRows,
  gearFields,
  gearHref,
  youtubeHomeLines,
  youtubeParentCards,
  type YouTubeGear,
} from "@/lib/youtube-node";

export function YouTubeHomeCard() {
  const lines = youtubeHomeLines();
  return (
    <section className="control-home" aria-label="YouTube">
      <NodeSquare parent home live label="YouTube">
        <Link href={YOUTUBE_HREF} className="node-log-link" title="Open YouTube">
          <div className="live-face parent-face">
            <h2 className="node-ticker">YouTube</h2>
            <ul className="parent-lines">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </Link>
      </NodeSquare>
    </section>
  );
}

export function YouTubeParent() {
  const cards = youtubeParentCards();
  return (
    <section className="node-grid home-floor" aria-label="YouTube">
      {cards.map((card) => (
        <NodeSquare key={card.id} parent home live={card.live} dashed={!card.live} label={card.label}>
          <Link href={card.href} className="node-log-link" title={`Open ${card.label}`}>
            <div className="live-face parent-face">
              <h2 className="node-ticker">{card.label}</h2>
              <p className="live-units">{card.figure}</p>
              {card.lines.length > 0 ? (
                <ul className="parent-lines">
                  {card.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Link>
        </NodeSquare>
      ))}
    </section>
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
