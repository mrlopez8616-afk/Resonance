import Link from "next/link";
import type { ReactNode } from "react";
import type { BookAvailability } from "@/components/bet-scorecard";
import type { Bet } from "@/lib/bets";
import { betStatusLabel, betsOnFight, cardMoney, formatSignedUsd, formatUsd } from "@/lib/bets";
import type { CalendarEvent } from "@/data/calendar";
import { civilWeekdayLong, formatCivilDate } from "@/lib/calendar-time";
import {
  eventBoutSections,
  fightPromotions,
  type DeskFight,
  type DeskPromotion,
} from "@/lib/fight-desk";
import { formatBoutLine, resultForFight, type FightResult } from "@/lib/fight-results";
import {
  UFC_332_EVENT,
  fightBySlug,
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

function TierTag({ tier }: { tier?: Bet["tier"] }) {
  if (!tier) return null;
  return <span className="bet-tier">{tier}</span>;
}

function FightStakeList({ bets }: { bets: readonly Bet[] }) {
  if (bets.length === 0) return null;
  return (
    <ul className="fight-stakes">
      {bets.map((bet) => (
        <li key={bet.id}>
          <TierTag tier={bet.tier} />
          {ticketLine(bet)}
        </li>
      ))}
    </ul>
  );
}

function boutLine(result: FightResult | null | undefined, bets: readonly Bet[]): string {
  return formatBoutLine(
    result,
    bets.map((bet) => bet.status),
  );
}

function FightSections({
  fights,
  renderFight,
}: {
  fights: readonly DeskFight[];
  renderFight: (fight: DeskFight) => ReactNode;
}) {
  const layout = eventBoutSections(fights);
  if (layout.kind === "list") {
    if (layout.fights.length === 0) return <p className="calendar-quiet">—</p>;
    return (
      <ol className="flex flex-col gap-3">
        {layout.fights.map((fight) => (
          <li key={fight.slug}>{renderFight(fight)}</li>
        ))}
      </ol>
    );
  }
  return (
    <>
      {layout.sections.map((section) => (
        <section key={section.id} id={section.id} className="calendar-day-section" aria-label={section.label}>
          <h3>{section.label}</h3>
          <ol className="flex flex-col gap-3">
            {section.fights.map((fight) => (
              <li key={fight.slug}>{renderFight(fight)}</li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}

function DeskFightCard({
  fight,
  resultLine,
}: {
  fight: DeskFight;
  resultLine: string;
}) {
  const body = (
    <>
      {fight.kicker ? <p className="log-kicker">{fight.kicker}</p> : null}
      <h3>{fight.title}</h3>
      {fight.detail ? <p>{fight.detail}</p> : null}
      <p className="fight-result">{resultLine}</p>
      <FightStakeList bets={fight.bets} />
    </>
  );
  if (!fight.href) return <div className="fight-card">{body}</div>;
  return (
    <Link href={fight.href} className="fight-card">
      {body}
    </Link>
  );
}

function ValueCard({
  href,
  label,
  bets,
  availability,
}: {
  href: string;
  label: string;
  bets: readonly Bet[];
  availability: BookAvailability;
}) {
  const face = cardMoney(bets);
  const line =
    availability === "unavailable"
      ? "unavailable"
      : face.detail
        ? `${label} · ${face.detail}`
        : label;
  return (
    <Link href={href} className="fight-card">
      {availability === "unavailable" ? (
        <h3>{label}</h3>
      ) : (
        <h3 className="fight-card-value">{face.headline}</h3>
      )}
      <p>
        {line}
        {availability === "seed-only" ? " · seed-only" : ""}
      </p>
    </Link>
  );
}

export function FightIndex({
  bets,
  events = [],
  availability = "live",
}: {
  bets: readonly Bet[];
  events?: readonly CalendarEvent[];
  availability?: BookAvailability;
}) {
  const promotions = fightPromotions({ bets, events });
  return (
    <div className="log-canvas">
      <header className="log-header">
        <Link href="/n/predictions" className="calendar-back">
          Predictions
        </Link>
        <p className="log-kicker">Predictions</p>
        <h2 className="log-title">Fights</h2>
      </header>
      <ol className="flex flex-col gap-3">
        {promotions.map((promotion) => (
          <li key={promotion.id}>
            <ValueCard
              href={promotion.href}
              label={promotion.label}
              bets={promotion.events.flatMap((event) => event.bets)}
              availability={availability}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function FightPromotion({
  promotion,
  availability = "live",
}: {
  promotion: DeskPromotion;
  availability?: BookAvailability;
}) {
  return (
    <div className="log-canvas">
      <header className="log-header">
        <Link href="/fights" className="calendar-back">
          Fights
        </Link>
        <p className="log-kicker">Fight Desk</p>
        <h2 className="log-title">{promotion.label}</h2>
      </header>
      {promotion.events.length === 0 ? (
        <p className="calendar-quiet">No bets</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {promotion.events.map((event) => (
            <li key={event.slug}>
              <ValueCard
                href={event.href}
                label={event.title}
                bets={event.bets}
                availability={availability}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EventMoneyHeader({
  backHref,
  backLabel,
  title,
  meta,
  bets,
  availability,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  meta?: string;
  bets: readonly Bet[];
  availability: BookAvailability;
}) {
  const face = cardMoney(bets);
  return (
    <header className="log-header">
      <Link href={backHref} className="calendar-back">
        {backLabel}
      </Link>
      {availability === "unavailable" ? (
        <>
          <p className="log-kicker">Event</p>
          <h2 className="log-title">{title}</h2>
          <p className="log-meta">unavailable</p>
        </>
      ) : (
        <>
          <h2 className="log-title">{face.headline}</h2>
          <p className="log-meta">{title}</p>
          {meta ? <p className="log-meta">{meta}</p> : null}
          {face.detail ? (
            <p className="log-meta">
              {face.detail}
              {availability === "seed-only" ? " · seed-only" : ""}
            </p>
          ) : availability === "seed-only" ? (
            <p className="log-meta">seed-only</p>
          ) : null}
        </>
      )}
    </header>
  );
}

export function ListedFightEvent({
  title,
  meta,
  fights,
  bets,
  results,
  eventSlug,
  backHref,
  backLabel,
  availability = "live",
  resultsAvailability = "live",
}: {
  title: string;
  meta: string;
  fights: readonly DeskFight[];
  bets: readonly Bet[];
  results: readonly FightResult[];
  eventSlug: string;
  backHref: string;
  backLabel: string;
  availability?: BookAvailability;
  resultsAvailability?: BookAvailability;
}) {
  return (
    <div className="log-canvas">
      <EventMoneyHeader
        backHref={backHref}
        backLabel={backLabel}
        title={title}
        meta={meta}
        bets={bets}
        availability={availability}
      />
      <FightSections
        fights={fights}
        renderFight={(fight) => (
          <DeskFightCard
            fight={fight}
            resultLine={
              resultsAvailability === "unavailable"
                ? "unavailable"
                : boutLine(resultForFight(results, fight.slug, eventSlug), fight.bets)
            }
          />
        )}
      />
    </div>
  );
}

export function FightEvent({
  bets,
  results,
  backHref,
  backLabel,
  availability = "live",
  resultsAvailability = "live",
}: {
  bets: readonly Bet[];
  results: readonly FightResult[];
  backHref: string;
  backLabel: string;
  availability?: BookAvailability;
  resultsAvailability?: BookAvailability;
}) {
  const place = `${UFC_332_EVENT.venue}, ${UFC_332_EVENT.city} · ${civilWeekdayLong(UFC_332_EVENT.date)} ${formatCivilDate(UFC_332_EVENT.date)} · America/Chicago`;
  return (
    <div className="log-canvas">
      <EventMoneyHeader
        backHref={backHref}
        backLabel={backLabel}
        title={UFC_332_EVENT.name}
        meta={place}
        bets={bets}
        availability={availability}
      />
      <FightSections
        fights={[
          ...fightsInSegment("early-prelims"),
          ...fightsInSegment("prelims"),
          ...fightsInSegment("main-card"),
        ].map((fight) => ({
          slug: fight.slug,
          title: `${fight.A.name} vs ${fight.B.name}`,
          kicker: `${fight.time} CT`,
          detail: fight.division,
          href: fight.href,
          segment: fight.segment === "main-card" ? "main-card" : "prelims",
          bets: betsOnFight(bets, fight.slug),
        }))}
        renderFight={(fight) => {
          const catalog = fightBySlug(fight.slug);
          const stake = fight.bets;
          return (
            <Link href={fight.href ?? `/fights/${UFC_332_EVENT.id}`} className="fight-card">
              {fight.kicker ? <p className="log-kicker">{fight.kicker}</p> : null}
              <h3>{fight.title}</h3>
              {fight.detail ? <p>{fight.detail}</p> : null}
              {catalog?.lean ? (
                <p>
                  Lean {catalog.lean}
                  {catalog.confidence ? ` · ${catalog.confidence}` : ""}
                </p>
              ) : null}
              <p className="fight-result">
                {resultsAvailability === "unavailable"
                  ? "unavailable"
                  : boutLine(resultForFight(results, fight.slug, UFC_332_EVENT.id), stake)}
              </p>
              {stake.length > 0 ? (
                <ul className="fight-stakes">
                  {stake.map((bet) => (
                    <li key={bet.id}>
                      <TierTag tier={bet.tier} />
                      {ticketLine(bet)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Link>
          );
        }}
      />
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
  backHref = `/fights/${UFC_332_EVENT.id}`,
  availability = "live",
  resultsAvailability = "live",
}: {
  fight: CatalogFight;
  bets: readonly Bet[];
  result?: FightResult | null;
  backHref?: string;
  availability?: BookAvailability;
  resultsAvailability?: BookAvailability;
}) {
  const stakes = betsOnFight(bets, fight.slug);
  const ticketsFor = (name: string) =>
    stakes.filter((bet) => bet.pick === name || bet.pick.includes(name));
  const labels = fight.A.stats.map((row) => row.label);
  return (
    <div className="log-canvas">
      <header className="log-header">
        <Link href={backHref} className="calendar-back">
          {UFC_332_EVENT.name}
        </Link>
        <p className="log-kicker">
          {fight.time} CT · {fight.division}
        </p>
        <h2 className="log-title">
          {fight.A.name} vs {fight.B.name}
        </h2>
        <p className="log-meta">
          {resultsAvailability === "unavailable"
            ? "Result unavailable"
            : boutLine(result, stakes)}
        </p>
        {availability === "unavailable" ? (
          <p className="log-meta">Tickets unavailable</p>
        ) : availability === "seed-only" ? (
          <p className="log-meta">Tickets are seed-only</p>
        ) : null}
      </header>

      <section className="calendar-day-section" aria-label="Result">
        <h3>Result</h3>
        {resultsAvailability === "unavailable" ? (
          <p>unavailable</p>
        ) : result && result.status === "final" ? (
          <dl>
            <Field label="Winner" value={result.winner} />
            <Field label="Method" value={result.method} />
            <Field label="Round" value={String(result.round)} />
            <Field label="Time" value={result.time} />
            {result.opponent ? <Field label="Opponent" value={result.opponent} /> : null}
          </dl>
        ) : (
          <p>{boutLine(result, stakes)}</p>
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
                  {bet.tier ? <Field label="Tier" value={bet.tier} /> : null}
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
