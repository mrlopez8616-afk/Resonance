import Link from "next/link";
import { NodeSquare } from "@/components/node-square";
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
  return (
    <NodeSquare parent home wide live label={bucket.label}>
      <Link href={bucket.href} className="node-log-link" title={`Open ${bucket.label}`}>
        <div className="live-face parent-face">
          <h2 className="node-ticker">{bucket.label}</h2>
          <p className="live-units">{bucket.count}</p>
          {bucket.preview.length > 0 ? (
            <ul className="parent-lines">
              {bucket.preview.map((event) => (
                <li key={event.id}>
                  {event.when} · {event.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="node-note">Nothing scheduled</p>
          )}
        </div>
      </Link>
    </NodeSquare>
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
    <section className="node-grid home-floor" aria-label="Catalyst weeks">
      {buckets.map((bucket) => (
        <CountCard key={bucket.id} bucket={bucket} />
      ))}
    </section>
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
    <section className="node-grid home-floor catalyst-entry" aria-label="Catalyst calendar">
      <NodeSquare parent home wide live label="Catalysts">
        <Link href={CATALYST_CALENDAR_HREF} className="node-log-link" title="Open Catalysts">
          <div className="live-face parent-face">
            <h2 className="node-ticker">Catalysts</h2>
            <p className="live-units">{count}</p>
            {line ? (
              <ul className="parent-lines">
                <li>{line}</li>
              </ul>
            ) : (
              <p className="node-note">Nothing scheduled</p>
            )}
          </div>
        </Link>
      </NodeSquare>
    </section>
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
