import Link from "next/link";
import { NodeSquare } from "@/components/node-square";
import { healthHomeLines, type MachineHealthReport, type MachineScore } from "@/lib/machine-health";

function percentText(percent: number | null): string {
  return percent === null ? "not connected" : `${percent}%`;
}

export function HealthHomeCard({ report }: { report: MachineHealthReport }) {
  const lines = healthHomeLines(report);
  const live = report.percent !== null;
  return (
    <section className="control-home" aria-label="Health of the Machine">
      <NodeSquare parent home live={live} dashed={!live} label="Health">
        <Link href="/n/health" className="node-log-link" title="Open Health of the Machine">
          <div className="live-face parent-face">
            <h2 className="node-ticker">Health</h2>
            <p className="health-home-score">{percentText(report.percent)}</p>
            {lines.length > 0 ? (
              <ul className="parent-lines">
                {lines.map((line) => (
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

function ScoreCard({ score }: { score: MachineScore }) {
  return (
    <li className="control-row" data-health-score={score.id}>
      <div>
        <p className="control-name">{score.label}</p>
        <p className="health-part-score">{percentText(score.percent)}</p>
        <p className="control-meta">{score.detail}</p>
        <p className="control-meta">{score.inputs}</p>
      </div>
    </li>
  );
}

export function HealthFloor({ report }: { report: MachineHealthReport }) {
  return (
    <div className="control-room" aria-label="Health of the Machine">
      <header className="log-header">
        <p className="log-kicker">Health of the Machine</p>
        <h2 className="log-title health-overall" data-health-overall>
          {percentText(report.percent)}
        </h2>
        <p className="log-meta">
          {report.percent === null
            ? "No score has data yet."
            : `Average of ${report.ready} of ${report.scores.length} scores.`}
        </p>
      </header>
      <ul className="control-list">
        {report.scores.map((score) => (
          <ScoreCard key={score.id} score={score} />
        ))}
      </ul>
    </div>
  );
}
