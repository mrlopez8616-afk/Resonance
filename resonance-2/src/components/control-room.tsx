import Link from "next/link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import {
  EmptyCard,
  NodeGrid,
  NodeHeader,
  NodeLayout,
  NodeSection,
  NodeSections,
  StatCard,
} from "@/components/node-layout";
import { controlHomeFace, tileFace } from "@/lib/home-faces";
import { latestTimestamp, type NodePart } from "@/lib/node-layout";
import {
  FEED_THRESHOLD_LINE,
  NO_SIGNAL,
  controlParentCards,
  formatControlWhen,
  type ControlAgentRow,
  type ControlApprovalRow,
  type ControlApprovals,
  type ControlFeedRow,
  type ControlRoomView,
  type ControlView,
} from "@/lib/control-room";

export function ControlHomeCard({
  lines,
  live,
  publicMode = false,
}: {
  lines: readonly string[];
  live: boolean;
  publicMode?: boolean;
}) {
  return <NodeFace face={controlHomeFace(lines, live, publicMode)} />;
}

function controlStamps(view: ControlRoomView): (string | null | undefined)[] {
  const stamps: (string | null | undefined)[] = [];
  if (view.approvals) {
    for (const row of view.approvals.pendingRows) stamps.push(row.at);
    for (const row of view.approvals.doneTodayRows) stamps.push(row.at);
  }
  for (const agent of view.agents) stamps.push(agent.at);
  for (const feed of view.feeds) stamps.push(feed.at);
  return stamps;
}

function controlParts(view: ControlRoomView): NodePart[] {
  const approvals: NodePart = view.approvals ? "live" : "missing";
  const heard = view.agents.filter((agent) => agent.at).length;
  const bots: NodePart =
    view.agents.length === 0 || heard === 0
      ? "missing"
      : heard === view.agents.length
        ? "live"
        : "partial";
  const stamped = view.feeds.filter((feed) => feed.at);
  const green = view.feeds.filter((feed) => feed.freshness === "green").length;
  const feeds: NodePart =
    view.feeds.length === 0
      ? "missing"
      : green === view.feeds.length
        ? "live"
        : stamped.length === 0
          ? "missing"
          : "partial";
  return [approvals, bots, feeds];
}

/** Parent floor. Child cards only. Rows live on /n/control/[view]. */
export function ControlParent({ view, now }: { view: ControlRoomView; now: Date }) {
  const cards = controlParentCards(view, now);
  return (
    <NodeLayout>
      <NodeHeader
        name="Control Room"
        parts={controlParts(view)}
        updatedAt={latestTimestamp(controlStamps(view))}
        backHref="/"
      />
      <p className="node-note">
        <Link href="/tv">Factory Floor</Link>
      </p>
      <NodeSections>
        <NodeSection kind="lists">
          <NodeFaceGrid label="Control Room">
            {cards.map((card) => (
              <NodeFace
                key={card.id}
                face={tileFace({
                  id: card.id,
                  glyph: "control",
                  href: card.href,
                  name: card.label,
                  headline: card.figure,
                  status: card.lines.join(" · ") || null,
                  live: card.live,
                })}
              />
            ))}
          </NodeFaceGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

function ApprovalCards({
  label,
  rows,
  now,
}: {
  label: string;
  rows: readonly ControlApprovalRow[];
  now: Date;
}) {
  if (rows.length === 0) return <EmptyCard label={label} span="list" />;
  return (
    <>
      {rows.map((row) => (
        <StatCard
          key={`${row.status}-${row.at}-${row.title}`}
          span="list"
          label={label}
          value={row.title}
          detail={`${row.agent}${row.status === "pending" ? "" : ` · ${row.status}`} · ${formatControlWhen(row.at, now)}`}
        />
      ))}
    </>
  );
}

function approvalChildParts(approvals: ControlApprovals): NodePart[] {
  const pending: NodePart = approvals.pendingRows.length > 0 ? "live" : "missing";
  const done: NodePart = approvals.doneTodayRows.length > 0 ? "live" : "missing";
  return [pending, done, "live"];
}

function agentPart(row: ControlAgentRow): NodePart {
  return row.at ? "live" : "missing";
}

function feedPart(row: ControlFeedRow): NodePart {
  if (!row.at) return "missing";
  return row.freshness === "green" ? "live" : "partial";
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
    const approvals = room.approvals;
    const updatedAt = latestTimestamp([
      ...approvals.pendingRows.map((row) => row.at),
      ...approvals.doneTodayRows.map((row) => row.at),
    ]);
    return (
      <NodeLayout>
        <NodeHeader name="Approvals" parts={approvalChildParts(approvals)} updatedAt={updatedAt} backHref="/n/control" />
        <p className="node-note">
          <Link href="/n/approvals">Open the queue</Link>
        </p>
        <NodeSections>
          <NodeSection kind="numbers">
            <NodeGrid>
              <StatCard label="Pending" value={String(approvals.pending)} detail="waiting" />
              <StatCard label="Done today" value={String(approvals.doneToday)} detail="recorded" />
            </NodeGrid>
          </NodeSection>
          <NodeSection kind="lists">
            <NodeGrid>
              <ApprovalCards label="Pending" rows={approvals.pendingRows} now={now} />
              <ApprovalCards label="Done today" rows={approvals.doneTodayRows} now={now} />
            </NodeGrid>
          </NodeSection>
        </NodeSections>
      </NodeLayout>
    );
  }

  if (view === "bots") {
    const updatedAt = latestTimestamp(room.agents.map((row) => row.at));
    return (
      <NodeLayout>
        <NodeHeader name="Bots" parts={room.agents.map(agentPart)} updatedAt={updatedAt} backHref="/n/control" />
        <p className="node-note">Last write we can name. Anything else is {NO_SIGNAL}.</p>
        <NodeSections>
          <NodeSection kind="lists" empty={room.agents.length === 0}>
            {room.agents.length === 0 ? null : (
              <NodeGrid>
                {room.agents.map((row) =>
                  row.at ? (
                    <StatCard
                      key={row.id}
                      label={row.name}
                      value={formatControlWhen(row.at, now)}
                      detail={row.source}
                    />
                  ) : (
                    <EmptyCard key={row.id} label={row.name} />
                  ),
                )}
              </NodeGrid>
            )}
          </NodeSection>
        </NodeSections>
      </NodeLayout>
    );
  }

  const updatedAt = latestTimestamp(room.feeds.map((row) => row.at));
  return (
    <NodeLayout>
      <NodeHeader name="Feeds" parts={room.feeds.map(feedPart)} updatedAt={updatedAt} backHref="/n/control" />
      <p className="node-note">{FEED_THRESHOLD_LINE}</p>
      <NodeSections>
        <NodeSection kind="lists" empty={room.feeds.length === 0}>
          {room.feeds.length === 0 ? null : (
            <NodeGrid>
              {room.feeds.map((row) =>
                row.at ? (
                  <StatCard key={row.id} label={row.label} value={formatControlWhen(row.at, now)} detail={row.freshness}>
                    <span className="fresh-dot" data-fresh={row.freshness} aria-hidden="true" />
                  </StatCard>
                ) : (
                  <EmptyCard key={row.id} label={row.label} />
                ),
              )}
            </NodeGrid>
          )}
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
