import Link from "next/link";
import { FighterLink } from "@/components/fighter-link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import {
  careerRecord,
  careerTrends,
  controlLabel,
  NOT_RECORDED,
  strikePair,
  type CareerFight,
  type CareerTrend,
} from "@/lib/fighter-careers";

function cell(value: string | number | null): string {
  if (value == null || value === "") return NOT_RECORDED;
  return String(value);
}

function TrendTiles({ trends }: { trends: readonly CareerTrend[] }) {
  return (
    <NodeFaceGrid label="Career trends">
      {trends.map((trend) => (
        <NodeFace
          key={trend.id}
          face={{
            id: `career-${trend.id}`,
            glyph: "fight-desk",
            href: "",
            name: trend.label,
            headline: trend.headline,
            status: trend.status,
            live: trend.headline !== NOT_RECORDED,
            tone: "",
          }}
        />
      ))}
    </NodeFaceGrid>
  );
}

/** Square trend tiles, then one row per fight. Missing cells read "not recorded". */
export function FighterCareerView({ name, fights }: { name: string; fights: readonly CareerFight[] }) {
  const trends = careerTrends(fights);
  const record = careerRecord(fights);
  return (
    <div className="log-canvas">
      <header className="log-header">
        <Link href="/fights" className="calendar-back">
          Fights
        </Link>
        <p className="log-kicker">Fighter</p>
        <h2 className="log-title">{name}</h2>
        <p className="log-meta">{record}</p>
        <p className="career-note">Last 3 fights against the career average. n counts fights that posted that stat.</p>
      </header>
      <TrendTiles trends={trends} />
      <section className="calendar-day-section" aria-label="Career">
        <h3>Career</h3>
        {fights.length === 0 ? (
          <p>{NOT_RECORDED}</p>
        ) : (
          <div className="fight-table-wrap">
            <table className="fight-table career-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Event</th>
                  <th scope="col">Opponent</th>
                  <th scope="col">Result</th>
                  <th scope="col">Method</th>
                  <th scope="col">Round</th>
                  <th scope="col">Time</th>
                  <th scope="col">Sig strikes</th>
                  <th scope="col">Total strikes</th>
                  <th scope="col">Takedowns</th>
                  <th scope="col">Sub att</th>
                  <th scope="col">Control</th>
                  <th scope="col">KD</th>
                </tr>
              </thead>
              <tbody>
                {fights.map((fight) => (
                  <tr key={`${fight.date}:${fight.opponent}`}>
                    <td>{fight.date}</td>
                    <td>{cell(fight.event)}</td>
                    <td>
                      <FighterLink name={fight.opponent} />
                    </td>
                    <td>{cell(fight.result)}</td>
                    <td>{cell(fight.method)}</td>
                    <td>{cell(fight.round)}</td>
                    <td>{cell(fight.time)}</td>
                    <td>{strikePair(fight.sigStrikesLanded, fight.sigStrikesAttempted)}</td>
                    <td>{strikePair(fight.totalStrikesLanded, fight.totalStrikesAttempted)}</td>
                    <td>{strikePair(fight.takedownsLanded, fight.takedownsAttempted)}</td>
                    <td>{cell(fight.subAttempts)}</td>
                    <td>{controlLabel(fight.controlTimeSeconds)}</td>
                    <td>{cell(fight.knockdowns)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
