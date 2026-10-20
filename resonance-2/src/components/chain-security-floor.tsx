import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { chainHomeFace, tileFace } from "@/lib/home-faces";
import {
  type ChainSecurityFeed,
  type ChainSecurityHomeModel,
  type ExposureWatch,
  type IncidentView,
} from "@/lib/chain-security";

const NO_INCIDENTS_RECORDED = "no incidents recorded";

function incidentStatus(incident: IncidentView): string {
  const line = `${incident.dateLabel} · ${incident.status}`;
  return incident.holdingChains.length > 0 ? `holding · ${line}` : line;
}

function IncidentCard({ incident }: { incident: IncidentView }) {
  return (
    <NodeFace
      face={tileFace({
        id: incident.id,
        glyph: "chain-security",
        href: incident.href,
        name: incident.subject,
        headline: incident.categoryLabel,
        status: incidentStatus(incident),
        live: true,
      })}
    />
  );
}

function ExposureCard({ watches }: { watches: readonly ExposureWatch[] }) {
  return (
    <section className="chain-exposure" aria-label="My exposure">
      <h3 className="brick-group">My exposure</h3>
      <NodeFaceGrid label="My exposure">
        {watches.map((watch) => {
          const first = watch.incidents[0];
          return (
            <NodeFace
              key={watch.id}
              face={tileFace({
                id: watch.id,
                glyph: "chain-security",
                href: first?.href ?? "",
                name: watch.label,
                headline: watch.incidents.length === 0 ? "0" : String(watch.incidents.length),
                status:
                  watch.incidents.length === 0 || !first
                    ? NO_INCIDENTS_RECORDED
                    : `${first.subject} · ${first.status}`,
                live: watch.incidents.length > 0,
              })}
            />
          );
        })}
      </NodeFaceGrid>
    </section>
  );
}

export function ChainSecurityHomeCard({
  card,
  publicMode = false,
}: {
  card: ChainSecurityHomeModel;
  publicMode?: boolean;
}) {
  return <NodeFace face={chainHomeFace(card, publicMode)} />;
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
          {NO_INCIDENTS_RECORDED}
        </p>
      ) : (
        feed.groups.map((group) => (
          <section key={group.category} aria-label={group.label}>
            <h3 className="brick-group">{group.label}</h3>
            <NodeFaceGrid label={group.label}>
              {group.incidents.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} />
              ))}
            </NodeFaceGrid>
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
        {incident.holdingChains.length > 0 ? (
          <li className="control-row">
            <div>
              <p className="control-name">Holding</p>
              <p className="control-meta">{incident.holdingChains.join(", ")}</p>
            </div>
          </li>
        ) : null}
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
