import Link from "next/link";
import {
  CALENDAR_LANE_LABELS,
  CALENDAR_LANES,
  CATALYST_NODES,
  type CalendarEvent,
  type CalendarLane,
  type CatalystNode,
} from "@/data/calendar";
import {
  adjacentWeekDay,
  calendarDayHref,
  calendarHref,
  calendarWeekDays,
  CALENDAR_LANE_FILTERS,
  chipsOnDay,
  eventWhenLabel,
  laneCountsOnDay,
  monthKeyForDay,
  monthLevelEvents,
  occurrenceClock,
  occurrencesOnDay,
  type CalendarChip,
  type CalendarDeskQuery,
  type CalendarOccurrence,
  type CalendarView,
} from "@/lib/calendar-desk";
import {
  adjacentMonth,
  civilMonthGrid,
  civilWeek,
  civilWeekdayLong,
  civilWeekdayShort,
  formatCivilDate,
  formatCivilMonth,
} from "@/lib/calendar-time";

const VIEWS: CalendarView[] = ["day", "week", "month"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
      <dt className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {label}
      </dt>
      <dd
        className={`min-w-0 break-words font-[family-name:var(--font-geist-mono)] text-[0.92rem] leading-6 ${toneClass}`}
      >
        {body}
      </dd>
    </div>
  );
}

function rowMark(event: CalendarEvent): string {
  if (event.node) return event.node;
  if (event.lane) return CALENDAR_LANE_LABELS[event.lane];
  return "";
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
  const statusTone =
    event.status === "tentative" ? "tentative" : settled || event.status === "confirmed" ? "ok" : undefined;
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
        {event.datePrecision && event.datePrecision !== "day" ? (
          <Field label="precision" value={event.datePrecision} />
        ) : null}
        {event.location ? <Field label="where" value={event.location} /> : null}
        {event.recurrence ? (
          <Field
            label="rhythm"
            value={`weekdays ${event.recurrence.time} ${event.recurrence.timeZone}`}
          />
        ) : null}
        {event.note ? <Field label="note" value={event.note} /> : null}
        {event.sourceUrl ? (
          <Field label="source" value={event.sourceUrl} href={event.sourceUrl} />
        ) : null}
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

function ChipList({ chips, overflow }: { chips: CalendarChip[]; overflow: number }) {
  if (chips.length === 0 && overflow === 0) return null;
  return (
    <span className="calendar-chips">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className={[
            "calendar-chip",
            chip.tentative ? "is-tentative" : "",
            chip.window ? "is-window" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-tone={chip.tone}
          title={chip.title}
        >
          {chip.label}
        </span>
      ))}
      {overflow > 0 ? <span className="calendar-chip-more">+{overflow}</span> : null}
    </span>
  );
}

function Itinerary({
  items,
  query,
  today,
  emptyLane,
  quietEmpty = false,
  showDetail = true,
}: {
  items: CalendarOccurrence[];
  query: CalendarDeskQuery;
  today: string;
  emptyLane: string;
  quietEmpty?: boolean;
  showDetail?: boolean;
}) {
  if (items.length === 0) {
    if (quietEmpty) {
      return <p className="calendar-quiet">Clear</p>;
    }
    return (
      <p className="rounded-xl border border-dashed border-[color:var(--border)] px-4 py-8 text-center text-sm leading-6 text-[color:var(--muted)]">
        {emptyLane ? `No ${emptyLane} events this day.` : "No events this day."}
      </p>
    );
  }

  return (
    <ol className="calendar-itinerary">
      {items.map((item) => {
        const current = query.event === item.event.id;
        const rowClass = [
          "calendar-row",
          current ? "is-current" : "",
          item.event.status === "tentative" ? "is-tentative" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <li key={`${item.day}-${item.event.id}`}>
            <Link
              href={calendarHref({
                day: item.day,
                view: query.view,
                lane: query.lane,
                node: query.node,
                event: item.event.id,
                today,
              })}
              className={rowClass}
              aria-current={current ? "true" : undefined}
            >
              <time dateTime={item.event.allDay ? item.day : item.start}>
                {occurrenceClock(item)}
              </time>
              <span className="calendar-row-lane">{rowMark(item.event)}</span>
              <span className="calendar-row-title">{item.event.title}</span>
              <span className="calendar-row-status">{item.event.status}</span>
            </Link>
            {current && showDetail ? (
              <EventDetail
                item={item}
                closeHref={calendarHref({
                  day: query.view === "week" ? query.day : item.day,
                  view: query.view,
                  lane: query.lane,
                  node: query.node,
                  today,
                })}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function MonthNotes({
  events,
  query,
  today,
  anchorDay,
}: {
  events: readonly CalendarEvent[];
  query: CalendarDeskQuery;
  today: string;
  anchorDay: string;
}) {
  if (events.length === 0) return null;
  return (
    <section className="calendar-month-notes" aria-label="This month">
      <p className="log-kicker">This month</p>
      <ul>
        {events.map((event) => {
          const current = query.event === event.id;
          return (
            <li key={event.id}>
              <Link
                href={calendarHref({
                  day: query.day,
                  view: query.view,
                  lane: query.lane,
                  node: query.node,
                  event: event.id,
                  today,
                })}
                className={[
                  "calendar-month-note",
                  current ? "is-current" : "",
                  event.status === "tentative" ? "is-tentative" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-tone={event.node}
                aria-current={current ? "true" : undefined}
              >
                <span>{event.node}</span>
                <span>{event.title}</span>
              </Link>
              {current ? (
                <EventDetail
                  item={{ event, start: event.start, day: anchorDay }}
                  closeHref={calendarHref({
                    day: query.day,
                    view: query.view,
                    lane: query.lane,
                    node: query.node,
                    today,
                  })}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function uniqueMonthEvents(
  events: readonly CalendarEvent[],
  days: readonly string[],
  query: CalendarDeskQuery,
): CalendarEvent[] {
  const seen = new Set<string>();
  const items: CalendarEvent[] = [];
  const keys = [...new Set(days.map((day) => monthKeyForDay(day)))];
  for (const key of keys) {
    for (const event of monthLevelEvents(events, key, query.lane, query.node)) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      items.push(event);
    }
  }
  return items;
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
  const week = calendarWeekDays(query.day, today);
  const visible = occurrencesOnDay(events, query.day, query.lane, query.node);
  const weekDays = civilWeek(query.day);
  const grid = civilMonthGrid(query.day);
  const monthKey = monthKeyForDay(query.day);
  const inMonth = grid.filter((day) => monthKeyForDay(day) === monthKey);
  const monthNotes = uniqueMonthEvents(
    events,
    query.view === "week" ? weekDays : query.view === "month" ? inMonth : [query.day],
    query,
  );
  const title =
    query.view === "month"
      ? formatCivilMonth(query.day)
      : query.view === "week"
        ? `Week of ${formatCivilDate(weekDays[0] ?? query.day)}`
        : civilWeekdayLong(query.day);
  const noun = visible.length === 1 ? "event" : "events";
  const when = query.day === today ? "Today" : formatCivilDate(query.day);
  const emptyLane = query.lane ? CALENDAR_LANE_LABELS[query.lane] : "";
  const countIds = (days: readonly string[], notes: readonly CalendarEvent[]) => {
    const ids = new Set<string>(notes.map((event) => event.id));
    for (const day of days) {
      for (const item of occurrencesOnDay(events, day, query.lane, query.node)) {
        ids.add(item.event.id);
      }
    }
    return ids.size;
  };
  const monthCount = countIds(inMonth, monthNotes);
  const weekCount = countIds(weekDays, monthNotes);
  const weekSelection = weekDays
    .flatMap((day) => occurrencesOnDay(events, day, query.lane, query.node))
    .find((item) => item.event.id === query.event);

  const filters = (
    <>
      <nav className="calendar-nodes" aria-label="Nodes">
        <Link
          href={calendarHref({
            day: query.day,
            view: query.view,
            lane: query.lane,
            today,
          })}
          className={query.node ? undefined : "is-current"}
          aria-current={query.node ? undefined : "true"}
        >
          All
        </Link>
        {CATALYST_NODES.map((node: CatalystNode) => {
          const current = node === query.node;
          return (
            <Link
              key={node}
              href={calendarHref({
                day: query.day,
                view: query.view,
                lane: query.lane,
                node,
                today,
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
          const current = lane === query.lane;
          return (
            <Link
              key={lane || "all"}
              href={calendarHref({
                day: query.day,
                view: query.view,
                lane,
                node: query.node,
                today,
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
    </>
  );

  return (
    <div className="log-canvas">
      <header className="log-header">
        <p className="log-kicker">Operating calendar</p>
        <h2 className="log-title">{title}</h2>
        <p className="log-meta">
          {query.view === "day" ? (
            <>
              {when}
              {query.day === today ? ` · ${formatCivilDate(query.day)}` : ""} · {visible.length}{" "}
              {noun}
            </>
          ) : query.view === "week" ? (
            <>
              {weekCount} {weekCount === 1 ? "event" : "events"}
            </>
          ) : (
            <>
              {monthCount} {monthCount === 1 ? "event" : "events"}
            </>
          )}
          {" · "}
          {storeLabel} · America/Chicago
        </p>
        <nav className="calendar-views" aria-label="Calendar view">
          {VIEWS.map((view) => {
            const current = view === query.view;
            return (
              <Link
                key={view}
                href={calendarHref({
                  day: query.day,
                  view,
                  lane: query.lane,
                  node: query.node,
                  today,
                })}
                className={current ? "is-current" : undefined}
                aria-current={current ? "true" : undefined}
              >
                {view}
              </Link>
            );
          })}
        </nav>
      </header>

      {filters}

      {query.view === "day" ? (
        <>
          <section className="log-nodes" aria-label="Week">
            <div className="calendar-week-head">
              <p className="log-kicker">Week</p>
              <div className="calendar-week-nav">
                <Link
                  href={calendarHref({
                    day: adjacentWeekDay(query.day, -1),
                    view: "day",
                    lane: query.lane,
                    node: query.node,
                    today,
                  })}
                >
                  Previous week
                </Link>
                <Link
                  href={calendarHref({
                    day: adjacentWeekDay(query.day, 1),
                    view: "day",
                    lane: query.lane,
                    node: query.node,
                    today,
                  })}
                >
                  Next week
                </Link>
              </div>
            </div>
            <ol>
              {week.map((day) => {
                const className = [
                  day.isSelected ? "is-current" : "",
                  day.isToday ? "is-today" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li key={day.date}>
                    <Link
                      href={calendarHref({
                        day: day.date,
                        view: "day",
                        lane: query.lane,
                        node: query.node,
                        today,
                      })}
                      className={className || undefined}
                      aria-current={day.isSelected ? "date" : undefined}
                    >
                      <span className="log-nodes-ticker">{civilWeekdayShort(day.date)}</span>
                      <span className="log-nodes-mark">{day.date.slice(8)}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
          <MonthNotes
            events={monthNotes}
            query={query}
            today={today}
            anchorDay={query.day}
          />
          <Itinerary items={visible} query={query} today={today} emptyLane={emptyLane} />
        </>
      ) : null}

      {query.view === "week" ? (
        <>
          <div className="calendar-week-head">
            <p className="log-kicker">Week</p>
            <div className="calendar-week-nav">
              <Link
                href={calendarHref({
                  day: adjacentWeekDay(query.day, -1),
                  view: "week",
                  lane: query.lane,
                  node: query.node,
                  today,
                })}
              >
                Previous week
              </Link>
              <Link
                href={calendarHref({
                  day: adjacentWeekDay(query.day, 1),
                  view: "week",
                  lane: query.lane,
                  node: query.node,
                  today,
                })}
              >
                Next week
              </Link>
            </div>
          </div>
          <MonthNotes events={monthNotes} query={query} today={today} anchorDay={query.day} />
          <ol className="calendar-week-board">
            {week.map((day) => {
              const items = occurrencesOnDay(events, day.date, query.lane, query.node);
              return (
                <li key={day.date} className={day.isToday ? "is-today" : undefined}>
                  <Link
                    href={calendarHref({
                      day: day.date,
                      view: "day",
                      lane: query.lane,
                      node: query.node,
                      today,
                    })}
                    className="calendar-week-day"
                  >
                    <span>{civilWeekdayShort(day.date)}</span>
                    <span>{day.date.slice(8)}</span>
                  </Link>
                  <Itinerary
                    items={items}
                    query={{ ...query, day: day.date, view: "week" }}
                    today={today}
                    emptyLane=""
                    quietEmpty
                    showDetail={false}
                  />
                </li>
              );
            })}
          </ol>
          {weekSelection && !monthNotes.some((event) => event.id === query.event) ? (
            <EventDetail
              item={weekSelection}
              closeHref={calendarHref({
                day: query.day,
                view: "week",
                lane: query.lane,
                node: query.node,
                today,
              })}
            />
          ) : null}
        </>
      ) : null}

      {query.view === "month" ? (
        <>
          <div className="calendar-week-head">
            <p className="log-kicker">Month</p>
            <div className="calendar-week-nav">
              <Link
                href={calendarHref({
                  day: adjacentMonth(query.day, -1),
                  view: "month",
                  lane: query.lane,
                  node: query.node,
                  today,
                })}
              >
                Previous month
              </Link>
              <Link
                href={calendarHref({
                  day: adjacentMonth(query.day, 1),
                  view: "month",
                  lane: query.lane,
                  node: query.node,
                  today,
                })}
              >
                Next month
              </Link>
            </div>
          </div>
          <MonthNotes events={monthNotes} query={query} today={today} anchorDay={query.day} />
          <table className="calendar-month">
            <thead>
              <tr>
                {DOW.map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chunk(grid, 7).map((row) => (
                <tr key={row[0]}>
                  {row.map((day) => {
                    const outside = monthKeyForDay(day) !== monthKey;
                    const packed = chipsOnDay(events, day, query.lane, query.node);
                    const counts = laneCountsOnDay(events, day, query.lane, query.node);
                    const count = occurrencesOnDay(events, day, query.lane, query.node).length;
                    const laneLabelText = CALENDAR_LANES.map(
                      (lane) => `${CALENDAR_LANE_LABELS[lane]} ${counts[lane]}`,
                    ).join(", ");
                    const className = [
                      outside ? "is-outside" : "",
                      day === today ? "is-today" : "",
                      day === query.day ? "is-current" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td key={day} className={className || undefined}>
                        <Link
                          href={calendarDayHref({
                            day,
                            anchor: query.day,
                            lane: query.lane,
                            node: query.node,
                          })}
                          className="calendar-day-node"
                          aria-label={`${formatCivilDate(day)}. ${laneLabelText}. ${count} ${count === 1 ? "event" : "events"}`}
                        >
                          <span className="calendar-month-date">{Number(day.slice(8))}</span>
                          <ChipList chips={packed.chips} overflow={packed.overflow} />
                          <span className="calendar-lane-counts">
                            {CALENDAR_LANES.map((lane) => (
                              <span key={lane} data-tone={lane} data-count={counts[lane]}>
                                <span className="sr-only">{CALENDAR_LANE_LABELS[lane]} </span>
                                {counts[lane]}
                              </span>
                            ))}
                          </span>
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}

function chunk(days: string[], size: number): string[][] {
  const rows: string[][] = [];
  for (let index = 0; index < days.length; index += size) {
    rows.push(days.slice(index, index + size));
  }
  return rows;
}
