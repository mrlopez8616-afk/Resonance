import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import type { NodePart } from "@/lib/node-layout";
import { cwrGroupCards, cwrItemCards } from "@/lib/crawl-walk-run-faces";
import { CWR_BUILD_HREF, CWR_HREF, cwrItems, groupHref, type CwrDetail, type CwrGroupId } from "@/lib/crawl-walk-run";

export function CrawlWalkRunParent() {
  const groups = cwrGroupCards();
  const parts: NodePart[] = groups.map((group) => (cwrItems(group.id).length > 0 ? "live" : "missing"));
  return (
    <NodeLayout>
      <NodeHeader name="Crawl Walk Run" parts={parts} backHref={CWR_BUILD_HREF} />
      <NodeSections>
        <NodeSection kind="lists">
          <NodeFaceGrid label="Crawl Walk Run">
            {groups.map((group) => (
              <NodeFace key={group.id} face={group.face} />
            ))}
          </NodeFaceGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

export function CrawlWalkRunGroup({ group }: { group: CwrGroupId }) {
  const items = cwrItemCards(group);
  const parts: NodePart[] = items.cards.length > 0 ? ["live"] : ["missing"];
  return (
    <NodeLayout>
      <NodeHeader name={items.label} parts={parts} backHref={CWR_HREF} />
      <NodeSections>
        <NodeSection kind="lists">
          {items.cards.length === 0 ? (
            <NodeGrid>
              <EmptyCard span="list" label={items.label} />
            </NodeGrid>
          ) : (
            <NodeFaceGrid label={items.label}>
              {items.cards.map((card) => (
                <NodeFace key={card.id} face={card.face} />
              ))}
            </NodeFaceGrid>
          )}
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

export function CrawlWalkRunItem({ detail }: { detail: CwrDetail }) {
  const held = detail.item.confidence === "conservative" ? "Stage held at the earlier reading." : null;
  const meta = [
    detail.headline,
    detail.item.stageMet ? `${detail.stageLabel} is the current stage` : "Crawl is still open",
    held,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <NodeLayout>
      <NodeHeader name={detail.item.title} parts={["live"]} backHref={groupHref(detail.group.id)} />
      <p className="node-note">{meta}</p>
      <NodeSections>
        <NodeSection kind="lists" label="Stages">
          <NodeGrid>
            {detail.stages.map((stage) => (
              <StatCard
                key={stage.id}
                span="list"
                label={stage.current ? `${stage.label} · current` : stage.label}
                value={stage.text}
              />
            ))}
            <StatCard span="list" label="What more can be done" value={detail.item.more} />
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="lists" label="Phase lines">
          <NodeGrid>
            {detail.phases.map((phase) => (
              <StatCard
                key={phase.id}
                span="list"
                label={phase.next ? `${phase.label} · next` : phase.label}
                value={phase.line}
              />
            ))}
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="lists" label="How this stage was read">
          <NodeGrid>
            <StatCard span="list" label="Record" value={detail.item.evidence} />
            <StatCard span="list" label="Sources" value={detail.item.sources.join(" · ")} />
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
