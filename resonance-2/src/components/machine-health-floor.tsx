import { NodeFace } from "@/components/node-face";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import { healthHomeFace } from "@/lib/home-faces";
import { type NodePart } from "@/lib/node-layout";
import { type MachineHealthReport, type MachineScore } from "@/lib/machine-health";

function percentText(percent: number | null): string {
  return percent === null ? "not connected" : `${percent}%`;
}

export function HealthHomeCard({ report }: { report: MachineHealthReport }) {
  return <NodeFace face={healthHomeFace(report)} />;
}

function scorePart(score: MachineScore): NodePart {
  return score.percent === null ? "missing" : "live";
}

/**
 * Five scores plus the overall average.
 * The report has no pull timestamp, so Updated stays off this page.
 */
export function HealthFloor({ report }: { report: MachineHealthReport }) {
  const overall =
    report.percent === null
      ? "No score has data yet."
      : `Average of ${report.ready} of ${report.scores.length} scores.`;
  return (
    <NodeLayout>
      <NodeHeader name="Health of the Machine" parts={report.scores.map(scorePart)} backHref="/" />
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            {report.percent === null ? (
              <EmptyCard label="Overall" />
            ) : (
              <StatCard label="Overall" value={percentText(report.percent)} detail={overall} />
            )}
            {report.scores.map((score) =>
              score.percent === null ? (
                <EmptyCard key={score.id} label={score.label} />
              ) : (
                <StatCard key={score.id} label={score.label} value={percentText(score.percent)} detail={score.inputs}>
                  <p className="node-card-detail">{score.detail}</p>
                </StatCard>
              ),
            )}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
