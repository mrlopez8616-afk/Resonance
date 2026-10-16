import Link from "next/link";
import { NodeSquare } from "@/components/node-square";
import {
  CHAIN_SECURITY_HREF,
  type ChainSecurityFeed,
  type ChainSecurityHomeModel,
  type ExposureWatch,
  type IncidentView,
} from "@/lib/chain-security";

function IncidentCard({ incident }: { incident: IncidentView }) {
  return (
    <NodeSquare parent home live label={incident.subject}>
      <Link href={incident.href} className="node-log-link" title={`Open ${incident.subject}`}>
        <div className="live-face parent-face">
          <h2 className="node-ticker">{incident.subject}</h2>
          <ul className="parent-lines">
            <li>{incident.categoryLabel}</li>
            <li>{incident.dateLabel}</li>
            <li>{incident.status}</li>
          </ul>
        </div>
      </Link>
    </NodeSquare>
  );
}

function ExposureCard({ watches }: { watches: readonly ExposureWatch[] }) {
  return (
    <section className="chain-exposure" aria-label="My exposure">
      <NodeSquare parent home live label="My exposure">
        <div className="live-face parent-face">
          <h2 className="node-ticker">My exposure</h2>
          <ul className="parent-lines chain-watches">
            {watches.map((watch) => (
              <li key={watch.id}>
                <span className="chain-watch-name">{watch.label}</span>
                {watch.incidents.length === 0 ? (
                  <span className="chain-watch-note">no incidents</span>
                ) : (
                  watch.incidents.map((incident) => (
                    <Link key={incident.id} href={incident.href}>
                      {incident.subject}
                      {" \u00b7 "}
                      {incident.status}
                    </Link>
                  ))
                )}
              </li>
            ))}
          </ul>
        </div>
      </NodeSquare>
    </section>
  );
}

export function ChainSecurityHomeCard({ card }: { card: ChainSecurityHomeModel }) {
  const empty = card.unavailable || card.count === 0;
  return (
    <section className="control-home" aria-label="Chain Security">
      <NodeSquare parent home live={!empty} dashed={empty} label="Chain Security">
        <Link href={CHAIN_SECURITY_HREF} className="node-log-link" title="Open Chain Security">
          <div className="live-face parent-face">
            <h2 className="node-ticker">Chain Security</h2>
            {card.unavailable ? (
              <p className="node-note">unavailable</p>
            ) : (
              <p className="live-units">{card.count}</p>
            )}
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
    </section>
  );
}

export function ChainSecurityFloor({ feed }: { feed: ChainSecurityFeed }) {
  return (
    <div className="chain-security">
      <header className="log-header">
        <p className="log-kicker">Weekly</p>
        <h2 className="log-title">Chain Security</h2>
        <p className="log-meta">{feed.countLabel}</p>
      </header>
      <ExposureCard watches={feed.watches} />
      {feed.groups.length === 0 ? (
        <p className="parent-empty" role="status">
          No incidents yet.
        </p>
      ) : (
        feed.groups.map((group) => (
          <section key={group.category} aria-label={group.label}>
            <h3 className="brick-group">{group.label}</h3>
            <div className="node-grid home-floor">
              {group.incidents.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

export function ChainSecurityDetail({ incident }: { incident: IncidentView }) {
  return (
    <div className="control-room">
      <header className="log-header">
        <p className="log-kicker">{incident.categoryLabel}</p>
        <h2 className="log-title">{incident.subject}</h2>
      </header>
      <ul className="control-list">
        <li className="control-row">
          <div>
            <p className="control-name">Date</p>
            <p className="control-meta">{incident.dateLabel}</p>
          </div>
        </li>
        <li className="control-row">
          <div>
            <p className="control-name">Chain or bridge</p>
            <p className="control-meta">{incident.subject}</p>
          </div>
        </li>
        <li className="control-row">
          <div>
            <p className="control-name">Category</p>
            <p className="control-meta">{incident.categoryLabel}</p>
          </div>
        </li>
        <li className="control-row">
          <div>
            <p className="control-name">Cause</p>
            <p className="control-meta">{incident.cause}</p>
          </div>
        </li>
        <li className="control-row">
          <div>
            <p className="control-name">Loss</p>
            <p className="control-meta">{incident.lossLabel}</p>
          </div>
        </li>
        <li className="control-row">
          <div>
            <p className="control-name">Status</p>
            <p className="control-meta">{incident.status}</p>
          </div>
        </li>
        <li className="control-row">
          <div>
            <p className="control-name">Source</p>
            <p className="control-meta">
              {incident.sourceUrl ? (
                <a href={incident.sourceUrl} rel="noreferrer">
                  {incident.sourceUrl}
                </a>
              ) : (
                incident.sourceLabel
              )}
            </p>
          </div>
        </li>
      </ul>
    </div>
  );
}
