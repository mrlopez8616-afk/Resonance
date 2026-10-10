import Link from "next/link";
import { NodeSquare } from "@/components/node-square";
import {
  FEED_THRESHOLD_LINE,
  NO_SIGNAL,
  controlParentCards,
  formatControlWhen,
  type ControlAgentRow,
  type ControlApprovalRow,
  type ControlFeedRow,
  type ControlRoomView,
  type ControlView,
} from "@/lib/control-room";

export function ControlHomeCard({ lines, live }: { lines: readonly string[]; live: boolean }) {
  return (
    <section className="control-home" aria-label="Control Room">
      <NodeSquare parent home live={live} dashed={!live} label="Control Room">
        <Link href="/n/control" className="node-log-link" title="Open Control Room">
          <div className="live-face parent-face">
            <h2 className="node-ticker">Control Room</h2>
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

export function ControlParent({ view, now }: { view: ControlRoomView; now: Date }) {
  const cards = controlParentCards(view, now);
  return (
    <section className="node-grid home-floor" aria-label="Control Room">
      {cards.map((card) => (
        <NodeSquare
          key={card.id}
          parent
          home
          live={card.live}
          dashed={!card.live}
          label={card.label}
        >
          <Link href={card.href} className="node-log-link" title={`Open ${card.label}`}>
            <div className="live-face parent-face">
              <h2 className="node-ticker">{card.label}</h2>
              <p className="live-units">{card.figure}</p>
              <ul className="parent-lines">
                {card.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </Link>
        </NodeSquare>
      ))}
    </section>
  );
}

function When({ at, now }: { at: string | null; now: Date }) {
  return <p className="control-meta">{formatControlWhen(at, now)}</p>;
}

function ApprovalRows({
  label,
  rows,
  now,
  empty,
}: {
  label: string;
  rows: readonly ControlApprovalRow[];
  now: Date;
  empty: string;
}) {
  return (
    <section className="control-block" aria-label={label}>
      <h3>{label}</h3>
      {rows.length === 0 ? <p className="control-meta">{empty}</p> : null}
      <ul className="control-list">
        {rows.map((row) => (
          <li key={`${row.status}-${row.at}-${row.title}`} className="control-row">
            <div>
              <p className="control-name">{row.title}</p>
              <p className="control-meta">
                {row.agent}
                {row.status === "pending" ? "" : ` · ${row.status}`}
              </p>
              <When at={row.at} now={now} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AgentRows({ rows, now }: { rows: readonly ControlAgentRow[]; now: Date }) {
  return (
    <ul className="control-list">
      {rows.map((row) => (
        <li key={row.id} className="control-row">
          <div>
            <p className="control-name">{row.name}</p>
            {row.at ? (
              <p className="control-meta">
                {row.source ? `${row.source} · ` : ""}
                {formatControlWhen(row.at, now)}
              </p>
            ) : (
              <p className="control-meta">{NO_SIGNAL}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function FeedRows({ rows, now }: { rows: readonly ControlFeedRow[]; now: Date }) {
  return (
    <ul className="control-list">
      {rows.map((row) => (
        <li key={row.id} className="control-row">
          <span className="fresh-dot" data-fresh={row.freshness} aria-hidden="true" />
          <div>
            <p className="control-name">{row.label}</p>
            <p className="control-meta">
              <span className="sr-only">{row.freshness}. </span>
              {formatControlWhen(row.at, now)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ControlChild({
  view,
  room,
  now,
}: {
  view: ControlView;
  room: ControlRoomView;
  now: Date;
}) {
  if (view === "approvals") {
    if (!room.approvals) return null;
    return (
      <div className="control-room">
        <header className="log-header">
          <p className="log-kicker">Scoreboard</p>
          <h2 className="log-title">Approvals</h2>
          <p className="log-meta">
            {room.approvals.pending} pending · {room.approvals.doneToday} done today
          </p>
          <p className="control-link">
            <Link href="/n/approvals">Open the queue</Link>
          </p>
        </header>
        <ApprovalRows
          label="Pending"
          rows={room.approvals.pendingRows}
          now={now}
          empty="none"
        />
        <ApprovalRows
          label="Done today"
          rows={room.approvals.doneTodayRows}
          now={now}
          empty="none"
        />
      </div>
    );
  }

  if (view === "bots") {
    return (
      <div className="control-room">
        <header className="log-header">
          <p className="log-kicker">Scoreboard</p>
          <h2 className="log-title">Bots</h2>
          <p className="log-meta">Last write we can name. Anything else is {NO_SIGNAL}.</p>
        </header>
        <AgentRows rows={room.agents} now={now} />
      </div>
    );
  }

  return (
    <div className="control-room">
      <header className="log-header">
        <p className="log-kicker">Scoreboard</p>
        <h2 className="log-title">Feeds</h2>
        <p className="control-note">{FEED_THRESHOLD_LINE}</p>
      </header>
      <FeedRows rows={room.feeds} now={now} />
    </div>
  );
}
