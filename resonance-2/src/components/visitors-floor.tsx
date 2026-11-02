import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import type { NodePart } from "@/lib/node-layout";
import type { VisitorSummary } from "@/lib/visitors-store";

export function VisitorsFloor({ summary }: { summary: VisitorSummary }) {
  const connected = summary.days.length > 0;
  const parts: NodePart[] = connected ? ["live"] : ["missing"];
  const peak = Math.max(1, ...summary.days.map((day) => day.views));
  return (
    <NodeLayout>
      <NodeHeader name="Visitors" parts={parts} backHref="/" />
      <p className="node-note">Anonymous counts</p>
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            {connected ? (
              <>
                <StatCard label="Today" value={String(summary.todayVisitors)} detail="visitors" />
                <StatCard label="Total" value={String(summary.totalVisitors)} detail="visitors" />
                <StatCard label="Page views" value={String(summary.totalViews)} />
              </>
            ) : (
              <>
                <EmptyCard label="Today" />
                <EmptyCard label="Total" />
                <EmptyCard label="Page views" />
              </>
            )}
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="trends">
          <NodeGrid>
            {summary.totalViews === 0 ? (
              <EmptyCard span="trend" label="Daily page views" />
            ) : (
              <StatCard span="trend" label="Daily page views">
                <svg className="visitors-chart" viewBox="0 0 280 88" role="img" aria-label="Daily page views">
                  {summary.days.map((day, index) => {
                    const height = Math.max(2, Math.round((day.views / peak) * 64));
                    const x = 8 + index * 19;
                    return <rect key={day.day} x={x} y={76 - height} width="12" height={height} rx="2" />;
                  })}
                </svg>
              </StatCard>
            )}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
