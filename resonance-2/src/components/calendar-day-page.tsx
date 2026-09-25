import Link from "next/link";
import {
  CALENDAR_LANE_LABELS,
  CALENDAR_LANES,
  CATALYST_NODES,
  type CalendarEvent,
  type CalendarLane,
  type CatalystNode,
} from "@/data/calendar";
import type { Fill } from "@/data/fills";
import { FillCard } from "@/components/fill-log";
import {
  calendarDayHref,
  calendarMonthBackHref,
  CALENDAR_LANE_FILTERS,
  eventWhenLabel,
  occurrenceClock,
  occurrencesOnDay,
  type CalendarOccurrence,
} from "@/lib/calendar-desk";
import { civilWeekdayLong, formatCivilDate } from "@/lib/calendar-time";
import { fillsOnPrintedDay } from "@/lib/fill-desk";

type DaySearch = {
  anchor: string;
  lane: CalendarLane | "";
  node: CatalystNode | "";
  event: string;
};

function Field({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: string;
  tone?: "ok" | "tentative";
  href?: string;
}) {
  const toneClass =
    tone === "ok"
      ? "text-[color:var(--ok)]"
      : tone === "tentative"
        ? "calendar-tentative"
        : "text-[color:var(--text)]";
  const body = href ? (
    href.startsWith("/") ? (
      <Link href={href}>{value}</Link>
    ) : (
      <a href={href} rel="noreferrer">
        {value}
      </a>
    )
  ) : (
    value
  );
  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-baseline gap-x-3 border-t border-[color:var(--border)] py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[5.75rem_minmax(0,1fr)]">
      <dt className="text-[0.68rem] font-medium uppercase tracking-[0.08em] text-[color:var(--muted)]">
        {label}
      </dt>
      <dd className={`min-w-0 break-words text-[0.95rem] leading-6 ${toneClass}`}>{body}</dd>
    </div>
  );
}

function EventDetail({ item, closeHref }: { item: CalendarOccurrence; closeHref: string }) {
  const { event } = item;
  const link = event.link;
  const openLabel = link?.startsWith("/log") ? "Open log" : "Open";
  const settled = event.status === "history" || event.status === "merged";
  const statusTone =
    event.status === "tentative"
      ? "tentative"
      : settled || event.status === "confirmed"
        ? "ok"
        : undefined;
  const when = eventWhenLabel(event);
  const showWhen = event.kind === "catalyst" || Boolean(event.end) || event.datePrecision === "month";

  return (
    <article className="calendar-detail">
      <dl>
        <Field label="time" value={occurrenceClock(item)} />
        {showWhen ? <Field label="when" value={when} /> : null}
        {event.node ? <Field label="node" value={event.node} /> : null}
        {event.lane ? <Field label="lane" value={CALENDAR_LANE_LABELS[event.lane]} /> : null}
        <Field label="title" value={event.title} />
        <Field label="status" value={event.status} tone={statusTone} />
        <Field label="writer" value={event.writer} />
        {event.location ? <Field label="where" value={event.location} /> : null}
        {event.note ? <Field label="note" value={event.note} /> : null}
        {event.sourceUrl ? <Field label="source" value={event.sourceUrl} href={event.sourceUrl} /> : null}
      </dl>
      <div className="calendar-detail-actions">
        {link ? (
          link.startsWith("/") ? (
            <Link href={link}>{openLabel}</Link>
          ) : (
            <a href={link} rel="noreferrer">
              {openLabel}
            </a>
          )
        ) : null}
        <Link href={closeHref}>Close</Link>
      </div>
    </article>
  );
}

function rowMark(event: CalendarEvent): string {
  if (event.node) return event.node;
  if (event.lane) return CALENDAR_LANE_LABELS[event.lane];
  return "";
}

function DayRows({
  items,
  day,
  search,
  empty,
}: {
  items: CalendarOccurrence[];
  day: string;
  search: DaySearch;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="calendar-quiet">{empty}</p>;
  }
  const closeHref = calendarDayHref({
    day,
    anchor: search.anchor,
    lane: search.lane,
    node: search.node,
  });
  return (
    <ol className="calendar-itinerary">
      {items.map((item) => {
        const current = search.event === item.event.id;
        const rowClass = [
          "calendar-row",
          current ? "is-current" : "",
          item.event.status === "tentative" ? "is-tentative" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <li key={item.event.id}>
            <Link
              href={calendarDayHref({
                day,
                anchor: search.anchor,
                lane: search.lane,
                node: search.node,
                event: item.event.id,
              })}
              className={rowClass}
              aria-current={current ? "true" : undefined}
            >
              <time dateTime={item.event.allDay ? item.day : item.start}>{occurrenceClock(item)}</time>
              <span className="calendar-row-lane">{rowMark(item.event)}</span>
              <span className="calendar-row-title">{item.event.title}</span>
              <span className="calendar-row-status">{item.event.status}</span>
            </Link>
            {item.event.sourceUrl ? (
              <a className="calendar-source" href={item.event.sourceUrl} rel="noreferrer">
                Source
              </a>
            ) : null}
            {current ? <EventDetail item={item} closeHref={closeHref} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function laneLabel(lane: CalendarLane | ""): string {
  return lane ? CALENDAR_LANE_LABELS[lane] : "All";
}

export function CalendarDayView({
  day,
  events,
  fills,
  search,
  today,
  storeLabel,
}: {
  day: string;
  events: readonly CalendarEvent[];
  fills: readonly Fill[];
  search: DaySearch;
  today: string;
  storeLabel: string;
}) {
  const visible = occurrencesOnDay(events, day, search.lane, search.node);
  const byLane: Record<CalendarLane, CalendarOccurrence[]> = {
    cadence: [],
    capital: [],
    build: [],
    gates: [],
  };
  const catalysts: CalendarOccurrence[] = [];
  for (const item of visible) {
    if (item.event.lane) byLane[item.event.lane].push(item);
    else catalysts.push(item);
  }
  const lanes = search.lane ? [search.lane] : [...CALENDAR_LANES];
  const showFills = search.lane === "" || search.lane === "capital";
  const printed = showFills ? fillsOnPrintedDay(fills, day) : [];
  const dayFills = search.node
    ? printed.filter((fill) => fill.symbol.toUpperCase() === search.node)
    : printed;
  const backHref = calendarMonthBackHref({
    day,
    anchor: search.anchor,
    lane: search.lane,
    node: search.node,
    today,
  });

  return (
    <div className="log-canvas">
      <header className="log-header">
        <Link href={backHref} className="calendar-back">
          Month map
        </Link>
        <p className="log-kicker">Day node</p>
        <h2 className="log-title">{civilWeekdayLong(day)}</h2>
        <p className="log-meta">
          {formatCivilDate(day)}
          {day === today ? " · Today" : ""} · {storeLabel} · America/Chicago
        </p>
        <nav className="calendar-nodes" aria-label="Nodes">
          <Link
            href={calendarDayHref({ day, anchor: search.anchor, lane: search.lane })}
            className={search.node ? undefined : "is-current"}
            aria-current={search.node ? undefined : "true"}
          >
            All
          </Link>
          {CATALYST_NODES.map((node) => {
            const current = node === search.node;
            return (
              <Link
                key={node}
                href={calendarDayHref({
                  day,
                  anchor: search.anchor,
                  lane: search.lane,
                  node,
                })}
                className={current ? "is-current" : undefined}
                aria-current={current ? "true" : undefined}
                data-tone={node}
              >
                {node}
              </Link>
            );
          })}
        </nav>
        <nav className="calendar-lanes" aria-label="Lanes">
          {CALENDAR_LANE_FILTERS.map((lane) => {
            const current = lane === search.lane;
            return (
              <Link
                key={lane || "all"}
                href={calendarDayHref({
                  day,
                  anchor: search.anchor,
                  lane,
                  node: search.node,
                })}
                className={current ? "is-current" : undefined}
                aria-current={current ? "true" : undefined}
                data-tone={lane || undefined}
              >
                {laneLabel(lane)}
              </Link>
            );
          })}
        </nav>
      </header>

      {lanes.map((lane) => (
        <section key={lane} className="calendar-day-section" aria-label={CALENDAR_LANE_LABELS[lane]}>
          <h3>{CALENDAR_LANE_LABELS[lane]}</h3>
          <DayRows items={byLane[lane]} day={day} search={search} empty="Clear" />
        </section>
      ))}

      {search.lane ? null : (
        <section className="calendar-day-section" aria-label="Catalysts">
          <h3>Catalysts</h3>
          <DayRows items={catalysts} day={day} search={search} empty="Clear" />
        </section>
      )}

      {showFills ? (
        <section className="calendar-day-section" aria-label="Fills">
          <h3>Fills</h3>
          <p className="calendar-section-note">Read from the fills store. This page does not write fills.</p>
          {dayFills.length === 0 ? (
            <p className="calendar-quiet">Clear</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {dayFills.map((fill) => (
                <li key={`${fill.orderId}-${fill.time}`}>
                  <FillCard fill={fill} />
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}
