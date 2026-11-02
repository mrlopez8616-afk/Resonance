import Link from "next/link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import { tileFace } from "@/lib/home-faces";
import { latestTimestamp, type NodePart } from "@/lib/node-layout";
import type { CalendarEvent } from "@/data/calendar";
import {
  CATALYST_CALENDAR_HREF,
  catalystBucketEvents,
  catalystBucketId,
  catalystBucketLabel,
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

function bucketParts(buckets: readonly CatalystBucketView[]): NodePart[] {
  return buckets.map((bucket) => (bucket.count > 0 ? "live" : "missing"));
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
  const starts = events.filter((event) => catalystBucketId(event, now)).map((event) => event.start);
  return (
    <NodeLayout>
      <NodeHeader
        name="Catalysts"
        parts={bucketParts(buckets)}
        updatedAt={latestTimestamp(starts)}
        backHref="/n/ai-stocks"
      />
      <NodeSections>
        <NodeSection kind="lists">
          <NodeFaceGrid label="Catalyst weeks">
            {buckets.map((bucket) => (
              <CountCard key={bucket.id} bucket={bucket} />
            ))}
          </NodeFaceGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
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
  const starts = events.filter((event) => catalystBucketId(event, now) === bucket).map((event) => event.start);
  const name = catalystBucketLabel(bucket);
  return (
    <NodeLayout>
      <NodeHeader
        name={name}
        parts={items.length > 0 ? ["live"] : ["missing"]}
        updatedAt={latestTimestamp(starts)}
        backHref={CATALYST_CALENDAR_HREF}
      />
      <NodeSections>
        <NodeSection kind="lists">
          {items.length === 0 ? (
            <NodeGrid>
              <EmptyCard span="list" label="Nothing scheduled" />
            </NodeGrid>
          ) : (
            <NodeGrid>
              {items.map((event) => (
                <StatCard
                  key={event.id}
                  span="list"
                  label={`${event.dateLabel} · ${event.timeLabel}`}
                  value={event.title}
                  href={event.href}
                />
              ))}
            </NodeGrid>
          )}
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}

export function CatalystEventDetail({
  event,
  backHref = CATALYST_CALENDAR_HREF,
}: {
  event: CalendarEvent;
  backHref?: string;
}) {
  const chips = catalystNodeChips(event);
  const date = catalystDateLabel(event);
  const time = catalystTimeLabel(event);
  return (
    <NodeLayout>
      <NodeHeader
        name={event.title || "Catalyst"}
        parts={event.title.trim() ? ["live"] : ["missing"]}
        updatedAt={event.start}
        backHref={backHref}
      />
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            {date ? <StatCard label="Date" value={date} /> : <EmptyCard label="Date" />}
            {time ? <StatCard label="Time" value={time} /> : <EmptyCard label="Time" />}
            <StatCard label="Status" value={catalystStatusLabel(event)} />
            {event.location ? <StatCard label="Location" value={event.location} /> : null}
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="lists">
          <NodeGrid>
            {event.note ? <StatCard span="list" label="Note" value={event.note} /> : null}
            {chips.length > 0 ? (
              <StatCard span="list" label="Nodes">
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
              </StatCard>
            ) : null}
            {event.sourceUrl ? (
              <StatCard span="list" label="Source">
                <p className="node-card-detail">
                  <a href={event.sourceUrl} rel="noreferrer">
                    Source
                  </a>
                </p>
              </StatCard>
            ) : null}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
