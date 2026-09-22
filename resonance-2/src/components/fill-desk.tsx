import Link from "next/link";
import type { Fill } from "@/data/fills";
import { FillLog } from "@/components/fill-log";
import { LOCKED_TICKERS } from "@/lib/fill-event";
import {
  DESK_SLEEVES,
  DESK_SOURCES,
  fillDeskHref,
  fillDeskIsActive,
  filterFills,
  recentFills,
  type FillDeskQuery,
} from "@/lib/fill-desk";
import { fillRowKey, formatFillTime } from "@/lib/fills";

export function FillDesk({
  fills,
  query,
  storeLabel,
}: {
  fills: Fill[];
  query: FillDeskQuery;
  storeLabel: string;
}) {
  const visible = filterFills(fills, query);
  const recent = recentFills(fills);
  const active = fillDeskIsActive(query);
  const title = query.ticker ? `${query.ticker} fills` : "Agentic sleeve fills";
  const counted = active ? fills.length : visible.length;
  const count = active ? `${visible.length} of ${fills.length}` : `${fills.length}`;
  const noun = counted === 1 ? "fill" : "fills";

  return (
    <div className="log-canvas">
      <header className="log-header">
        <p className="log-kicker">Search desk</p>
        <h2 className="log-title">{title}</h2>
        <p className="log-meta">
          {count} {noun} · {storeLabel} · one store · hub POST
        </p>
      </header>

      {recent.length > 0 ? (
        <section className="log-recent" aria-label="Recent fills">
          <p className="log-kicker">Recent</p>
          <ol>
            {recent.map((fill) => {
              const href = fillDeskHref({ ticker: fill.symbol });
              const current = href === fillDeskHref(query);
              return (
                <li key={fillRowKey(fill)}>
                  <Link
                    href={href}
                    className={current ? "is-current" : undefined}
                    aria-current={current ? "true" : undefined}
                  >
                    <span className="log-recent-ticker">{fill.symbol}</span>
                    <span className={fill.side === "sell" ? "is-sell" : "is-buy"}>
                      {fill.side}
                    </span>
                    <span className="log-recent-time">{formatFillTime(fill.time)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <form
        key={fillDeskHref(query)}
        className="log-desk"
        method="get"
        action="/log"
        autoComplete="off"
      >
        <label className="log-field">
          <span>ticker</span>
          <select name="ticker" defaultValue={query.ticker}>
            <option value="">all</option>
            {LOCKED_TICKERS.map((ticker) => (
              <option key={ticker} value={ticker}>
                {ticker}
              </option>
            ))}
          </select>
        </label>
        <label className="log-field">
          <span>from</span>
          <input name="from" type="date" defaultValue={query.from} />
        </label>
        <label className="log-field">
          <span>to</span>
          <input name="to" type="date" defaultValue={query.to} />
        </label>
        <label className="log-field">
          <span>sleeve</span>
          <select name="sleeve" defaultValue={query.sleeve}>
            <option value="">all</option>
            {DESK_SLEEVES.map((sleeve) => (
              <option key={sleeve.id} value={sleeve.id}>
                {sleeve.label}
              </option>
            ))}
          </select>
        </label>
        <label className="log-field">
          <span>source</span>
          <select name="source" defaultValue={query.source}>
            <option value="">all</option>
            {DESK_SOURCES.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <div className="log-actions">
          <button type="submit" className="log-search">
            Search
          </button>
          {active ? (
            <Link href="/log" className="log-clear">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <FillLog fills={visible} empty={fills.length === 0 ? "store" : "desk"} />
    </div>
  );
}
