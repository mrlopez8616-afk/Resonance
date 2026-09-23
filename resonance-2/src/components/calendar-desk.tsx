import Link from "next/link";
import {
  CALENDAR_LANE_LABELS,
  type CalendarEvent,
  type CalendarLane,
} from "@/data/calendar";
import {
  adjacentWeekDay,
  calendarHref,
  calendarWeekDays,
  CALENDAR_LANE_FILTERS,
  occurrencesOnDay,
  type CalendarDeskQuery,
  type CalendarOccurrence,
} from "@/lib/calendar-desk";
import {
  civilWeekdayLong,
  civilWeekdayShort,
  formatChicagoClock,
  formatChicagoStamp,
  formatCivilDate,
} from "@/lib/calendar-time";

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok";
}) {
  const toneClass =
    tone === "ok" ? "text-[color:var(--ok)]" : "text-[color:var(--text)]";
  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-baseline gap-x-3 border-t border-[color:var(--border)] py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[5.75rem_minmax(0,1fr)]">
      <dt className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {label}
      </dt>
      <dd
        className={`min-w-0 break-words font-[family-name:var(--font-geist-mono)] text-[0.92rem] leading-6 ${toneClass}`}
      >
        {value}
      </dd>
    </div>
  );
}

function EventDetail({
  item,
  closeHref,
}: {
  item: CalendarOccurrence;
  closeHref: string;
}) {
  const { event } = item;
  const link = event.link;
  const openLabel = link?.startsWith("/log") ? "Open log" : "Open";
  const settled = event.status === "history" || event.status === "merged";

  return (
    <article className="calendar-detail">
      <dl>
        <Field label="time" value={formatChicagoStamp(item.start)} />
        <Field label="lane" value={CALENDAR_LANE_LABELS[event.lane]} />
        <Field label="title" value={event.title} />
        <Field label="status" value={event.status} tone={settled ? "ok" : undefined} />
        <Field label="writer" value={event.writer} />
        {event.recurrence ? (
          <Field
            label="rhythm"
            value={`weekdays ${event.recurrence.time} ${event.recurrence.timeZone}`}
          />
        ) : null}
        {event.note ? <Field label="note" value={event.note} /> : null}
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

function laneLabel(lane: CalendarLane | ""): string {
  return lane ? CALENDAR_LANE_LABELS[lane] : "All";
}

export function CalendarDesk({
  events,
  query,
  today,
  storeLabel,
}: {
  events: readonly CalendarEvent[];
  query: CalendarDeskQuery;
  today: string;
  storeLabel: string;
}) {
  const visible = occurrencesOnDay(events, query.day, query.lane);
  const selected =
    visible.find((item) => item.event.id === query.event) ?? null;
  const week = calendarWeekDays(query.day, today);
  const title = civilWeekdayLong(query.day);
  const noun = visible.length === 1 ? "event" : "events";
  const when = query.day === today ? "Today" : formatCivilDate(query.day);
  const emptyLane = query.lane ? CALENDAR_LANE_LABELS[query.lane].toLowerCase() : "";

  return (
    <div className="log-canvas">
      <header className="log-header">
        <p className="log-kicker">Operating calendar</p>
        <h2 className="log-title">{title}</h2>
        <p className="log-meta">
          {when}
          {query.day === today ? ` · ${formatCivilDate(query.day)}` : ""} ·{" "}
          {visible.length} {noun} · {storeLabel} · America/Chicago
        </p>
      </header>

      <section className="log-nodes" aria-label="Week">
        <div className="calendar-week-head">
          <p className="log-kicker">Week</p>
          <div className="calendar-week-nav">
            <Link
              href={calendarHref({
                day: adjacentWeekDay(query.day, -1),
                lane: query.lane,
                today,
              })}
            >
              Previous week
            </Link>
            <Link
              href={calendarHref({
                day: adjacentWeekDay(query.day, 1),
                lane: query.lane,
                today,
              })}
            >
              Next week
            </Link>
          </div>
        </div>
        <ol>
          {week.map((day) => {
            const href = calendarHref({
              day: day.date,
              lane: query.lane,
              today,
            });
            const className = [
              day.isSelected ? "is-current" : "",
              day.isToday ? "is-today" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={day.date}>
                <Link
                  href={href}
                  className={className || undefined}
                  aria-current={day.isSelected ? "date" : undefined}
                >
                  <span className="log-nodes-ticker">
                    {civilWeekdayShort(day.date)}
                  </span>
                  <span className="log-nodes-mark">{day.date.slice(8)}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <nav className="calendar-lanes" aria-label="Lanes">
        {CALENDAR_LANE_FILTERS.map((lane) => {
          const current = lane === query.lane;
          return (
            <Link
              key={lane || "all"}
              href={calendarHref({ day: query.day, lane, today })}
              className={current ? "is-current" : undefined}
              aria-current={current ? "true" : undefined}
            >
              {laneLabel(lane)}
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--border)] px-4 py-8 text-center text-sm leading-6 text-[color:var(--muted)]">
          {emptyLane
            ? `No ${emptyLane} events this day.`
            : "No events this day."}
        </p>
      ) : (
        <ol className="calendar-itinerary">
          {visible.map((item) => {
            const current = selected?.event.id === item.event.id;
            return (
              <li key={item.event.id}>
                <Link
                  href={calendarHref({
                    day: query.day,
                    lane: query.lane,
                    event: item.event.id,
                    today,
                  })}
                  className={current ? "calendar-row is-current" : "calendar-row"}
                  aria-current={current ? "true" : undefined}
                >
                  <time dateTime={item.start}>{formatChicagoClock(item.start)}</time>
                  <span className="calendar-row-lane">
                    {CALENDAR_LANE_LABELS[item.event.lane]}
                  </span>
                  <span className="calendar-row-title">{item.event.title}</span>
                  <span className="calendar-row-status">{item.event.status}</span>
                </Link>
                {current ? (
                  <EventDetail
                    item={item}
                    closeHref={calendarHref({
                      day: query.day,
                      lane: query.lane,
                      today,
                    })}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
