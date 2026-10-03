import type { FightDeskSummary } from "@/lib/bets";

/** Non-asset floor face. The parent link drills into /fights. */
export function FightDeskFace({ summary }: { summary: FightDeskSummary }) {
  return (
    <div className="live-face fight-desk">
      <header className="live-head">
        <h2 className="node-ticker">Fight Desk</h2>
      </header>
      <p className="live-units">
        {summary.open}
        <span> open</span>
      </p>
      <p className="live-units">
        {summary.stakedLabel}
        <span> staked</span>
      </p>
      <p className="live-value">
        {summary.potentialLabel}
        <span> {summary.estimated ? "return est." : "return"}</span>
      </p>
      <ul className="live-sleeves">
        <li>
          <span className="sleeve-mark" aria-hidden />
          <span className="sleeve-label">Record</span>
          <span className="sleeve-qty">{summary.record}</span>
        </li>
      </ul>
    </div>
  );
}
