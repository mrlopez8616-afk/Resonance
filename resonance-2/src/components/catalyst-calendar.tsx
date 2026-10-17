import Link from "next/link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { tileFace } from "@/lib/home-faces";
import type { CalendarEvent } from "@/data/calendar";
import {
  CATALYST_CALENDAR_HREF,
  catalystBucketEvents,
  catalystBuckets,
  catalystDateLabel,
  catalystEntryLine,
  catalystNodeChips,
  catalystStatusLabel,
  catalystTimeLabel,
  catalystUpcomingCount,
  type CatalystBucketId,
  type CatalystBucketView,
} from "@/lib/catalyst-calendar";

function CountCard({ bucket }: { bucket: CatalystBucketView }) {
  const first = bucket.preview[0];
  return (
    <NodeFace
      face={tileFace({
        id: bucket.id,
        glyph: "ai-stocks",
        href: bucket.href,
        name: bucket.label,
        headline: String(bucket.count),
        status: first ? `${first.when} · ${first.title}` : "Nothing scheduled",
        live: true,
      })}
    />
  );
}

export function CatalystWeekCards({
  events,
  now,
}: {
  events: readonly CalendarEvent[];
  now: Date;
}) {
  const buckets = catalystBuckets(events, now).filter(
    (bucket) => bucket.id !== "later" || bucket.count > 0,
  );
  return (
    <NodeFaceGrid label="Catalyst weeks">
      {buckets.map((bucket) => (
        <CountCard key={bucket.id} bucket={bucket} />
      ))}
    </NodeFaceGrid>
  );
}

export function CatalystEntry({
  events,
  now,
}: {
  events: readonly CalendarEvent[];
  now: Date;
}) {
  const count = catalystUpcomingCount(events, now);
  const line = catalystEntryLine(events, now);
  return (
    <NodeFaceGrid label="Catalyst calendar">
      <NodeFace
        face={tileFace({
          id: "catalysts",
          glyph: "ai-stocks",
          href: CATALYST_CALENDAR_HREF,
          name: "Catalysts",
          headline: String(count),
          status: line || "Nothing scheduled",
          live: true,
        })}
      />
    </NodeFaceGrid>
  );
}

export function CatalystWeekList({
  events,
  bucket,
  now,
}: {
  events: readonly CalendarEvent[];
  bucket: CatalystBucketId;
  now: Date;
}) {
  const items = catalystBucketEvents(events, bucket, now);
  if (items.length === 0) {
    return <p className="parent-empty">Nothing scheduled</p>;
  }
  return (
    <ul className="catalyst-list">
      {items.map((event) => (
        <li key={event.id}>
          <Link href={event.href} className="catalyst-row">
            <span className="catalyst-row-when">
              {event.dateLabel} · {event.timeLabel}
            </span>
            <span className="catalyst-row-title">{event.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CatalystEventDetail({ event }: { event: CalendarEvent }) {
  const chips = catalystNodeChips(event);
  return (
    <article className="catalyst-detail">
      <h2>{event.title}</h2>
      <p className="catalyst-meta">{catalystDateLabel(event)}</p>
      <p className="catalyst-meta">{catalystTimeLabel(event)}</p>
      <p className="catalyst-meta">{catalystStatusLabel(event)}</p>
      {event.location ? <p className="catalyst-meta">{event.location}</p> : null}
      {event.note ? <p className="catalyst-note">{event.note}</p> : null}
      {chips.length > 0 ? (
        <div className="catalyst-chips" aria-label="Nodes">
          {chips.map((chip) =>
            chip.href ? (
              <Link key={chip.label} href={chip.href} className="calendar-chip">
                {chip.label}
              </Link>
            ) : (
              <span key={chip.label} className="calendar-chip">
                {chip.label}
              </span>
            ),
          )}
        </div>
      ) : null}
      {event.sourceUrl ? (
        <p className="catalyst-meta">
          <a href={event.sourceUrl} rel="noreferrer">
            Source
          </a>
        </p>
      ) : null}
    </article>
  );
}
