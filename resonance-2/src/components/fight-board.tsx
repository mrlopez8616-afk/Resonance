import Link from "next/link";
import { BetScorecard } from "@/components/bet-scorecard";
import type { Bet } from "@/lib/bets";
import { betStatusLabel, betsOnFight, formatSignedUsd, formatUsd, summarizeBets } from "@/lib/bets";
import { civilWeekdayLong, formatCivilDate } from "@/lib/calendar-time";
import { formatFightResult, ufc332ResultLine, type FightResult } from "@/lib/fight-results";
import {
  UFC_332_EVENT,
  fightsInSegment,
  type CatalogFight,
  type FighterSide,
} from "@/lib/ufc332";

function moneyline(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value > 0) return `+${value}`;
  return String(value);
}

function percent(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value}%`;
}

function ticketOdds(bet: Bet): string {
  const pct = `${bet.oddsPct}%`;
  return bet.estimated ? `~${pct}` : pct;
}

function ticketLine(bet: Bet): string {
  const pnl = bet.realizedPnl ? ` · ${formatSignedUsd(bet.realizedPnl)}` : "";
  return `${bet.pick} ${formatUsd(bet.stake)} → ${formatUsd(bet.payout)}${bet.estimated ? " est." : ""} @ ${ticketOdds(bet)} · ${betStatusLabel(bet.status)}${pnl}`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-t border-[color:var(--border)] py-2.5 first:border-t-0 first:pt-0">
      <dt className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-[0.95rem] leading-6">{value}</dd>
    </div>
  );
}

export function FightIndex({
  bets,
  results,
}: {
  bets: readonly Bet[];
  results: readonly FightResult[];
}) {
  const open = bets.filter((bet) => bet.status === "open").length;
  return (
    <div className="log-canvas">
      <header className="log-header">
        <p className="log-kicker">Fight Desk</p>
        <h2 className="log-title">Fights</h2>
        <p className="log-meta">
          {open} open {open === 1 ? "bet" : "bets"} · Coinbase Predict · founder places the bets
        </p>
      </header>
      <BetScorecard bets={bets} />
      <ol className="flex flex-col gap-3">
        <li>
          <Link href={`/fights/${UFC_332_EVENT.id}`} className="fight-card">
            <p className="log-kicker">Event</p>
            <h3>{UFC_332_EVENT.name}</h3>
            <p>
              {UFC_332_EVENT.venue}, {UFC_332_EVENT.city}
            </p>
            <p>
              {civilWeekdayLong(UFC_332_EVENT.date)} {formatCivilDate(UFC_332_EVENT.date)}
            </p>
            <p className="fight-result">{ufc332ResultLine(results)}</p>
            <ul>
              {UFC_332_EVENT.segments.map((segment) => (
                <li key={segment.id}>
                  {segment.label} {segment.start}
                </li>
              ))}
            </ul>
          </Link>
        </li>
      </ol>
    </div>
  );
}

export function FightEvent({
  bets,
  results,
}: {
  bets: readonly Bet[];
  results: readonly FightResult[];
}) {
  const summary = summarizeBets(bets);
  return (
    <div className="log-canvas">
      <header className="log-header">
        <Link href="/fights" className="calendar-back">
          Fights
        </Link>
        <p className="log-kicker">Event</p>
        <h2 className="log-title">{UFC_332_EVENT.name}</h2>
        <p className="log-meta">
          {UFC_332_EVENT.venue}, {UFC_332_EVENT.city} · {civilWeekdayLong(UFC_332_EVENT.date)}{" "}
          {formatCivilDate(UFC_332_EVENT.date)} · America/Chicago
        </p>
        <p className="log-meta">
          {summary.stakedLabel} staked · {summary.potentialLabel}{" "}
          {summary.estimated ? "return est." : "return"}
        </p>
      </header>
      {UFC_332_EVENT.segments.map((segment) => {
        const fights = fightsInSegment(segment.id);
        return (
          <section key={segment.id} id={segment.id} className="calendar-day-section" aria-label={segment.label}>
            <h3>
              {segment.label} · {segment.start}
            </h3>
            <ol className="flex flex-col gap-3">
              {fights.map((fight) => {
                const stake = betsOnFight(bets, fight.slug);
                return (
                  <li key={fight.slug}>
                    <Link href={fight.href} className="fight-card">
                      <p className="log-kicker">{fight.time} CT</p>
                      <h3>
                        {fight.A.name} vs {fight.B.name}
                      </h3>
                      <p>{fight.division}</p>
                      {fight.lean ? (
                        <p>
                          Lean {fight.lean}
                          {fight.confidence ? ` · ${fight.confidence}` : ""}
                        </p>
                      ) : null}
                      <p className="fight-result">
                        {formatFightResult(results.find((row) => row.fightSlug === fight.slug))}
                      </p>
                      {stake.length > 0 ? (
                        <ul className="fight-stakes">
                          {stake.map((bet) => (
                            <li key={bet.id}>{ticketLine(bet)}</li>
                          ))}
                        </ul>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function SideHead({ side }: { side: FighterSide }) {
  return (
    <div>
      <h3>{side.name}</h3>
      <p className="fight-links">
        {side.sherdog ? (
          <a href={side.sherdog} rel="noreferrer">
            Sherdog
          </a>
        ) : null}
        {side.ufcstats ? (
          <a href={side.ufcstats} rel="noreferrer">
            UFCStats
          </a>
        ) : null}
      </p>
      {side.noUfcStats ? (
        <p className="calendar-section-note">UFC rate stats: not found (no UFC fights).</p>
      ) : null}
    </div>
  );
}

function OddsColumn({ side, bets }: { side: FighterSide; bets: readonly Bet[] }) {
  return (
    <div>
      <h3>{side.name}</h3>
      <dl>
        <Field label="Coinbase" value={percent(side.coinbasePct)} />
        <Field label="No-vig" value={percent(side.noVigPct)} />
        <Field label="Median ML" value={moneyline(side.medianMoneyline)} />
        {side.books.map((row) => (
          <Field key={row.book} label={row.book} value={moneyline(row.moneyline)} />
        ))}
        {bets.map((bet) => (
          <Field key={bet.id} label="Your ticket" value={ticketLine(bet)} />
        ))}
      </dl>
    </div>
  );
}

export function FightDetail({
  fight,
  bets,
  result,
}: {
  fight: CatalogFight;
  bets: readonly Bet[];
  result?: FightResult | null;
}) {
  const stakes = betsOnFight(bets, fight.slug);
  const ticketsFor = (name: string) =>
    stakes.filter((bet) => bet.pick === name || bet.pick.includes(name));
  const labels = fight.A.stats.map((row) => row.label);
  return (
    <div className="log-canvas">
      <header className="log-header">
        <Link href={`/fights/${UFC_332_EVENT.id}`} className="calendar-back">
          {UFC_332_EVENT.name}
        </Link>
        <p className="log-kicker">
          {fight.time} CT · {fight.division}
        </p>
        <h2 className="log-title">
          {fight.A.name} vs {fight.B.name}
        </h2>
        <p className="log-meta">{formatFightResult(result)}</p>
      </header>

      <section className="calendar-day-section" aria-label="Result">
        <h3>Result</h3>
        {result && result.status === "final" ? (
          <dl>
            <Field label="Winner" value={result.winner} />
            <Field label="Method" value={result.method} />
            <Field label="Round" value={String(result.round)} />
            <Field label="Time" value={result.time} />
            {result.opponent ? <Field label="Opponent" value={result.opponent} /> : null}
          </dl>
        ) : (
          <p>Pending</p>
        )}
      </section>

      <section className="calendar-day-section" aria-label="Matchup">
        <h3>Matchup</h3>
        <div className="fight-split">
          <SideHead side={fight.A} />
          <SideHead side={fight.B} />
        </div>
      </section>

      <section className="calendar-day-section" aria-label="Stats">
        <h3>Stats</h3>
        <div className="fight-table-wrap">
          <table className="fight-table">
            <thead>
              <tr>
                <th scope="col">Stat</th>
                <th scope="col">{fight.A.name}</th>
                <th scope="col">{fight.B.name}</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label, index) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{fight.A.stats[index]?.value ?? "—"}</td>
                  <td>{fight.B.stats[index]?.value ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fight-split">
          {[fight.A, fight.B].map((side) => (
            <div key={side.slug}>
              <h3>Last 5 · {side.name}</h3>
              {side.last5.length === 0 ? (
                <p className="calendar-quiet">—</p>
              ) : (
                <ul className="fight-last5">
                  {side.last5.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="calendar-day-section" aria-label="Lean">
        <h3>Lean</h3>
        <dl>
          <Field label="Lean" value={fight.lean ?? "—"} />
          <Field label="Confidence" value={fight.confidence ?? "—"} />
          <Field label="Why" value={fight.why ?? "—"} />
          {fight.xFactor ? <Field label="X-factor" value={fight.xFactor} /> : null}
        </dl>
        {fight.edges.length > 0 ? (
          <ul className="fight-last5">
            {fight.edges.map((edge) => (
              <li key={edge}>{edge}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="calendar-day-section" aria-label="Odds">
        <h3>Odds check</h3>
        <p className="calendar-section-note">
          Book prices are BestFightOdds moneylines. Coinbase and no-vig percents are the card file.
          Your ticket is the founder Coinbase Predict price.
        </p>
        <div className="fight-split">
          <OddsColumn side={fight.A} bets={ticketsFor(fight.A.name)} />
          <OddsColumn side={fight.B} bets={ticketsFor(fight.B.name)} />
        </div>
      </section>

      <section className="calendar-day-section" aria-label="Highlights">
        <h3>Highlights</h3>
        <ul className="fight-last5">
          {[fight.A, fight.B].map((side) => (
            <li key={side.slug}>
              {side.highlight ? (
                <a href={side.highlight.url} rel="noreferrer">
                  {side.name}: {side.highlight.title}
                  {side.highlight.channel !== "—" ? ` · ${side.highlight.channel}` : ""}
                </a>
              ) : (
                <span>
                  {side.name}: —
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="calendar-day-section" aria-label="Stake">
        <h3>Founder stake</h3>
        {stakes.length === 0 ? (
          <p className="calendar-quiet">—</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {stakes.map((bet) => (
              <li key={bet.id} className="fight-card">
                <dl>
                  <Field label="Pick" value={bet.pick} />
                  {bet.hubLean ? <Field label="Hub lean" value={bet.hubLean} /> : null}
                  {typeof bet.agreesWithLean === "boolean" ? (
                    <Field label="Agrees" value={bet.agreesWithLean ? "yes" : "no"} />
                  ) : null}
                  <Field label="Stake" value={formatUsd(bet.stake)} />
                  <Field label="Odds" value={ticketOdds(bet)} />
                  <Field
                    label="Payout"
                    value={`${formatUsd(bet.payout)}${bet.estimated ? " est." : ""}`}
                  />
                  <Field label="Status" value={betStatusLabel(bet.status)} />
                  {bet.note ? <Field label="Note" value={bet.note} /> : null}
                  {bet.realizedPnl ? (
                    <Field label="P&L" value={formatSignedUsd(bet.realizedPnl)} />
                  ) : null}
                  <Field label="Venue" value="Coinbase Predict" />
                </dl>
                <p className="mt-3 text-sm">
                  <Link href="/log?ticker=UFC">Open UFC log</Link>
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
