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
  nodesWithValue,
  type FillDeskQuery,
} from "@/lib/fill-desk";

export function FillDesk({
  fills,
  sleeves,
  query,
  storeLabel,
}: {
  fills: Fill[];
  sleeves: Readonly<Record<string, readonly { quantity: string }[] | undefined>>;
  query: FillDeskQuery;
  storeLabel: string;
}) {
  const visible = filterFills(fills, query);
  const nodes = nodesWithValue(fills, sleeves);
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

      {nodes.length > 0 ? (
        <section className="log-nodes" aria-label="Nodes">
          <p className="log-kicker">Nodes</p>
          <ol>
            {nodes.map((node) => {
              const href = fillDeskHref({ ticker: node.ticker });
              const current = href === fillDeskHref(query);
              return (
                <li key={node.ticker}>
                  <Link
                    href={href}
                    className={current ? "is-current" : undefined}
                    aria-current={current ? "true" : undefined}
                  >
                    <span className="log-nodes-ticker">{node.ticker}</span>
                    <span className="log-nodes-mark">{node.mark}</span>
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
