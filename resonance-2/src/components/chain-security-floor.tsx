import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import { chainHomeFace, tileFace } from "@/lib/home-faces";
import type { NodePart } from "@/lib/node-layout";
import {
  CHAIN_SECURITY_HREF,
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

function ExposureCard({ watches }: { watches: readonly ExposureWatch[] }) {
  return (
    <section className="chain-exposure" aria-label="My exposure">
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

function chainParts(feed: ChainSecurityFeed): NodePart[] {
  const exposure: NodePart = feed.watches.some((watch) => watch.incidents.length > 0) ? "live" : "missing";
  const incidents: NodePart = feed.count > 0 ? "live" : "missing";
  return [exposure, incidents];
}

export function ChainSecurityFloor({ feed }: { feed: ChainSecurityFeed | null }) {
  if (!feed) {
    return (
      <NodeLayout>
        <NodeHeader name="Chain Security" parts={["missing"]} backHref="/" />
        <NodeSections>
          <NodeSection kind="lists">
            <NodeGrid>
              <EmptyCard span="list" label={NO_INCIDENTS_RECORDED} />
            </NodeGrid>
          </NodeSection>
        </NodeSections>
      </NodeLayout>
    );
  }
  return (
    <NodeLayout>
      <NodeHeader name="Chain Security" parts={chainParts(feed)} backHref="/" />
      <p className="node-note">{feed.countLabel}</p>
      <NodeSections>
        <NodeSection kind="lists" label="My exposure">
          <ExposureCard watches={feed.watches} />
        </NodeSection>
        <NodeSection kind="lists" label="Incidents">
          {feed.groups.length === 0 ? (
            <NodeGrid>
              <EmptyCard span="list" label={NO_INCIDENTS_RECORDED} />
            </NodeGrid>
          ) : (
            feed.groups.map((group) => (
              <section key={group.category} aria-label={group.label}>
                <h3 className="brick-group">{group.label}</h3>
                <NodeGrid>
                  {group.incidents.map((incident) => (
                    <StatCard
                      key={incident.id}
                      span="list"
                      label={incident.categoryLabel}
                      value={incident.subject}
                      detail={incidentStatus(incident)}
                      href={incident.href}
                    />
                  ))}
                </NodeGrid>
              </section>
            ))
          )}
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return <StatCard span="list" label={label} value={value} />;
}

export function ChainSecurityDetail({ incident }: { incident: IncidentView | null }) {
  if (!incident) {
    return (
      <NodeLayout>
        <NodeHeader name="Incident" parts={["missing"]} backHref={CHAIN_SECURITY_HREF} />
        <NodeSections>
          <NodeSection kind="lists">
            <NodeGrid>
              <EmptyCard span="list" label="Incident" />
            </NodeGrid>
          </NodeSection>
        </NodeSections>
      </NodeLayout>
    );
  }
  return (
    <NodeLayout>
      <NodeHeader name={incident.subject} parts={["live"]} backHref={CHAIN_SECURITY_HREF} />
      <p className="node-note">{incident.categoryLabel}</p>
      <NodeSections>
        <NodeSection kind="lists">
          <NodeGrid>
            <DetailLine label="Date" value={incident.dateLabel} />
            <DetailLine label="Chain or bridge" value={incident.subject} />
            <DetailLine label="Category" value={incident.categoryLabel} />
            {incident.holdingChains.length > 0 ? (
              <DetailLine label="Holding" value={incident.holdingChains.join(", ")} />
            ) : null}
            <DetailLine label="Cause" value={incident.cause} />
            <DetailLine label="Loss" value={incident.lossLabel} />
            <DetailLine label="Status" value={incident.status} />
            <StatCard span="list" label="Source">
              <p className="node-card-detail">
                {incident.sourceUrl ? (
                  <a href={incident.sourceUrl} rel="noreferrer">
                    {incident.sourceUrl}
                  </a>
                ) : (
                  incident.sourceLabel
                )}
              </p>
            </StatCard>
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
