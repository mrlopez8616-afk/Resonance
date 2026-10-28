import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { cwrGroupCards, cwrItemCards } from "@/lib/crawl-walk-run-faces";
import type { CwrDetail, CwrGroupId } from "@/lib/crawl-walk-run";

export function CrawlWalkRunParent() {
  return (
    <NodeFaceGrid label="Crawl Walk Run">
      {cwrGroupCards().map((group) => (
        <NodeFace key={group.id} face={group.face} />
      ))}
    </NodeFaceGrid>
  );
}

export function CrawlWalkRunGroup({ group }: { group: CwrGroupId }) {
  const items = cwrItemCards(group);
  return (
    <NodeFaceGrid label={items.label}>
      {items.cards.map((card) => (
        <NodeFace key={card.id} face={card.face} />
      ))}
    </NodeFaceGrid>
  );
}

export function CrawlWalkRunItem({ detail }: { detail: CwrDetail }) {
  const held = detail.item.confidence === "conservative" ? "Stage held at the earlier reading." : null;
  return (
    <div className="control-room">
      <header className="log-header">
        <p className="log-kicker">{detail.group.label}</p>
        <h2 className="log-title">{detail.item.title}</h2>
        <p className="log-meta">
          {detail.headline}
          {detail.item.stageMet ? ` · ${detail.stageLabel} is the current stage` : " · Crawl is still open"}
          {held ? ` · ${held}` : ""}
        </p>
      </header>
      <ul className="control-list" aria-label="Stages">
        {detail.stages.map((stage) => (
          <li key={stage.id} className="control-row">
            <div>
              <p className="control-name">{stage.current ? `${stage.label} · current` : stage.label}</p>
              <p className="control-meta">{stage.text}</p>
            </div>
          </li>
        ))}
        <li className="control-row">
          <div>
            <p className="control-name">What more can be done</p>
            <p className="control-meta">{detail.item.more}</p>
          </div>
        </li>
      </ul>
      <h3 className="brick-group">Phase lines</h3>
      <ul className="control-list" aria-label="Phase lines">
        {detail.phases.map((phase) => (
          <li key={phase.id} className="control-row">
            <div>
              <p className="control-name">{phase.next ? `${phase.label} · next` : phase.label}</p>
              <p className="control-meta">{phase.line}</p>
            </div>
          </li>
        ))}
      </ul>
      <h3 className="brick-group">How this stage was read</h3>
      <ul className="control-list" aria-label="Evidence">
        <li className="control-row">
          <div>
            <p className="control-name">Record</p>
            <p className="control-meta">{detail.item.evidence}</p>
          </div>
        </li>
        <li className="control-row">
          <div>
            <p className="control-name">Sources</p>
            <p className="control-meta">{detail.item.sources.join(" · ")}</p>
          </div>
        </li>
      </ul>
    </div>
  );
}
