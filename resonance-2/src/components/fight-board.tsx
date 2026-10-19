import Link from "next/link";
import type { ReactNode } from "react";
import type { BookAvailability } from "@/components/bet-scorecard";
import { BetWriteError, betStatusLabel, betsOnFight, cardMoney, formatSignedUsd, formatUsd, type Bet, type CardMoney } from "@/lib/bets";
import { FighterLink } from "@/components/fighter-link";
import { SubmissionTiles } from "@/components/submission-tiles";
import { submissionBoards } from "@/lib/fight-submission";
import { isDecimalString } from "@/lib/decimal";
import type { CalendarEvent } from "@/data/calendar";
import { civilWeekdayLong, formatCivilDate } from "@/lib/calendar-time";
import { detailTimeLabel, fightDetailVisibility } from "@/lib/fight-breakdowns";
import {
  eventBoutSections,
  fightersFromTitle,
  fightPromotions,
  type DeskFight,
  type DeskPromotion,
} from "@/lib/fight-desk";
import { parentById, parentCardHref } from "@/lib/node-parents";
import {
  fightOutcome,
  fightOutcomeLabel,
  formatBoutLine,
  hasNoWinner,
  resultForFight,
  type FightResult,
} from "@/lib/fight-results";
import {
  UFC_332_EVENT,
  fightBySlug,
  fightsInSegment,
  personSlug,
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
  if (typeof bet.oddsPct !== "number" || !Number.isFinite(bet.oddsPct)) return "—";
  const pct = `${bet.oddsPct}%`;
  return bet.estimated ? `~${pct}` : pct;
}

/** A stored amount that is not a decimal is shown as stored. A bad row must not blank the page. */
function shownUsd(value: unknown): string {
  if (typeof value === "string" && isDecimalString(value.trim())) return formatUsd(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "—";
}

function shownSigned(value: unknown): string {
  if (typeof value === "string" && isDecimalString(value.trim())) return formatSignedUsd(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return "—";
}

function safeCardMoney(bets: readonly Bet[]): CardMoney {
  try {
    return cardMoney(bets);
  } catch (error) {
    if (!(error instanceof BetWriteError)) throw error;
    return { headline: "unavailable", detail: "" };
  }
}

function ticketLine(bet: Bet): string {
  const pnl = bet.realizedPnl ? ` · ${shownSigned(bet.realizedPnl)}` : "";
  return `${bet.pick} ${shownUsd(bet.stake)} → ${shownUsd(bet.payout)}${bet.estimated ? " est." : ""} @ ${ticketOdds(bet)} · ${betStatusLabel(bet.status)}${pnl}`;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
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

function shownTicketTier(bet: Bet, fight?: DeskFight): Bet["tier"] | undefined {
  if (!fight?.tierNote || bet.tier !== "STRONG" || !fight.lean) return bet.tier;
  if (personSlug(bet.pick) !== personSlug(fight.lean)) return bet.tier;
  return fight.tier ?? undefined;
}

function FightStakeList({ bets, fight }: { bets: readonly Bet[]; fight?: DeskFight }) {
  if (bets.length === 0) return null;
  return (
    <ul className="fight-stakes">
      {bets.map((bet, index) => (
        <li key={`${bet.id}:${index}`}>
          <TierTag tier={shownTicketTier(bet, fight)} />
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
        {layout.fights.map((fight, index) => (
          <li key={`${fight.slug}:${index}`}>{renderFight(fight)}</li>
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
            {section.fights.map((fight, index) => (
              <li key={`${fight.slug}:${index}`}>{renderFight(fight)}</li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}

function analysisLine(fight: DeskFight): string | null {
  if (!fight.lean && !fight.conf && !fight.tier && !fight.stakePlan) return null;
  const parts = [
    fight.lean ? `Lean ${fight.lean}` : null,
    fight.conf ?? null,
    fight.tier ?? null,
    fight.stakePlan === "PLAY" ? "PLAY" : fight.stakePlan === "free" ? "free" : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
}

function BoutNames({ title }: { title: string }) {
  const names = fightersFromTitle(title);
  if (names.length !== 2) return <h3>{title}</h3>;
  return (
    <h3>
      <FighterLink name={names[0] ?? ""} />
      {" vs "}
      <FighterLink name={names[1] ?? ""} />
    </h3>
  );
}

function DeskFightCard({
  fight,
  resultLine,
}: {
  fight: DeskFight;
  resultLine: string;
}) {
  const lean = analysisLine(fight);
  const body = (
    <>
      {fight.kicker ? <p className="log-kicker">{fight.kicker}</p> : null}
      {fight.detail ? <p>{fight.detail}</p> : null}
      {lean ? <p>{lean}</p> : null}
      {fight.tierNote ? <p>{fight.tierNote}</p> : null}
      {fight.why ? <p>{fight.why}</p> : null}
      <p className="fight-result">{resultLine}</p>
      <FightStakeList bets={fight.bets} fight={fight} />
    </>
  );
  const tiles = fight.submission?.length ? <SubmissionTiles boards={fight.submission} /> : null;
  if (!fight.href) {
    return (
      <div className="fight-card">
        <BoutNames title={fight.title} />
        {body}
        {tiles}
      </div>
    );
  }
  return (
    <div className="fight-card">
      <BoutNames title={fight.title} />
      <Link href={fight.href} className="fight-card-link">
        {body}
      </Link>
      {tiles}
    </div>
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
  const face = safeCardMoney(bets);
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
        <Link href={parentCardHref("fight-desk")} className="calendar-back">
          {parentById("fight-desk")?.label ?? "Fight Desk"}
        </Link>
        <p className="log-kicker">{parentById("fight-desk")?.label ?? "Fight Desk"}</p>
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
  const face = safeCardMoney(bets);
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
          segment: fight.segment,
          boutOrder: fight.n,
          bets: betsOnFight(bets, fight.slug),
        }))}
        renderFight={(fight) => {
          const catalog = fightBySlug(fight.slug);
          const stake = fight.bets;
          const boards = catalog
            ? submissionBoards({
                aName: catalog.A.name,
                bName: catalog.B.name,
                lean: catalog.lean,
                aStats: catalog.A.stats,
                bStats: catalog.B.stats,
              })
            : [];
          return (
            <div className="fight-card">
              <BoutNames title={fight.title} />
              <Link href={fight.href ?? `/fights/${UFC_332_EVENT.id}`} className="fight-card-link">
                {fight.kicker ? <p className="log-kicker">{fight.kicker}</p> : null}
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
                    {stake.map((bet, index) => (
                      <li key={`${bet.id}:${index}`}>
                        <TierTag tier={bet.tier} />
                        {ticketLine(bet)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Link>
              <SubmissionTiles boards={boards} />
            </div>
          );
        }}
      />
    </div>
  );
}

function SideHead({ side }: { side: FighterSide }) {
  return (
    <div>
      <h3>
        <FighterLink name={side.name} />
      </h3>
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

function OddsColumn({
  side,
  bets,
  hideEmpty = false,
}: {
  side: FighterSide;
  bets: readonly Bet[];
  hideEmpty?: boolean;
}) {
  const books = hideEmpty ? side.books.filter((row) => row.moneyline != null) : side.books;
  return (
    <div>
      <h3>
        <FighterLink name={side.name} />
      </h3>
      <dl>
        {!hideEmpty || side.coinbasePct != null ? (
          <Field label="Coinbase" value={percent(side.coinbasePct)} />
        ) : null}
        {!hideEmpty || side.noVigPct != null ? (
          <Field label="No-vig" value={percent(side.noVigPct)} />
        ) : null}
        {!hideEmpty || side.medianMoneyline != null ? (
          <Field label="Median ML" value={moneyline(side.medianMoneyline)} />
        ) : null}
        {books.map((row) => (
          <Field key={row.book} label={row.book} value={moneyline(row.moneyline)} />
        ))}
        {bets.map((bet, index) => (
          <Field key={`${bet.id}:${index}`} label="Your ticket" value={ticketLine(bet)} />
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
  backLabel = UFC_332_EVENT.name,
  hideEmpty = false,
  availability = "live",
  resultsAvailability = "live",
}: {
  fight: CatalogFight;
  bets: readonly Bet[];
  result?: FightResult | null;
  backHref?: string;
  backLabel?: string;
  hideEmpty?: boolean;
  availability?: BookAvailability;
  resultsAvailability?: BookAvailability;
}) {
  const stakes = betsOnFight(bets, fight.slug);
  const ticketsFor = (name: string) =>
    stakes.filter((bet) => bet.pick === name || bet.pick.includes(name));
  const labels = fight.A.stats.map((row) => row.label);
  const visibility = hideEmpty ? fightDetailVisibility(fight, bets, result) : null;
  const kicker = hideEmpty
    ? [detailTimeLabel(fight.time), fight.division].filter(Boolean).join(" · ")
    : `${fight.time} CT · ${fight.division}`;
  const show = (name: keyof NonNullable<typeof visibility>) => !visibility || visibility[name];
  const bookPrices = [...fight.A.books, ...fight.B.books].some((row) => row.moneyline != null);
  return (
    <div className="log-canvas">
      <header className="log-header">
        <Link href={backHref} className="calendar-back">
          {backLabel}
        </Link>
        {kicker ? (
          <p className="log-kicker">
            {kicker}
          </p>
        ) : null}
        <h2 className="log-title">
          <FighterLink name={fight.A.name} /> vs <FighterLink name={fight.B.name} />
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

      {show("result") ? (
      <section className="calendar-day-section" aria-label="Result">
        <h3>Result</h3>
        {resultsAvailability === "unavailable" ? (
          <p>unavailable</p>
        ) : result && result.status === "final" ? (
          <dl>
            {hasNoWinner(result) ? (
              <Field label="Outcome" value={fightOutcomeLabel(fightOutcome(result))} />
            ) : (
              <Field label="Winner" value={<FighterLink name={result.winner} />} />
            )}
            <Field label="Method" value={result.method} />
            <Field label="Round" value={String(result.round)} />
            <Field label="Time" value={result.time} />
            {result.opponent ? <Field label="Opponent" value={<FighterLink name={result.opponent} />} /> : null}
          </dl>
        ) : (
          <p>{boutLine(result, stakes)}</p>
        )}
      </section>
      ) : null}

      {show("matchup") ? (
      <section className="calendar-day-section" aria-label="Matchup">
        <h3>Matchup</h3>
        <div className="fight-split">
          <SideHead side={fight.A} />
          <SideHead side={fight.B} />
        </div>
      </section>
      ) : null}

      <SubmissionTiles
        boards={submissionBoards({
          aName: fight.A.name,
          bName: fight.B.name,
          lean: fight.lean,
          aStats: fight.A.stats,
          bStats: fight.B.stats,
        })}
      />

      {show("stats") ? (
      <section className="calendar-day-section" aria-label="Stats">
        <h3>Stats</h3>
        {labels.length > 0 ? (
        <div className="fight-table-wrap">
          <table className="fight-table">
            <thead>
              <tr>
                <th scope="col">Stat</th>
                <th scope="col">
                  <FighterLink name={fight.A.name} />
                </th>
                <th scope="col">
                  <FighterLink name={fight.B.name} />
                </th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label, index) => (
                <tr key={`${label}:${index}`}>
                  <th scope="row">{label}</th>
                  <td>{fight.A.stats[index]?.value ?? "—"}</td>
                  <td>{fight.B.stats[index]?.value ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : null}
        <div className="fight-split">
          {[fight.A, fight.B].filter((side) => !hideEmpty || side.last5.length > 0).map((side, index) => (
            <div key={`${side.slug}:${index}`}>
              <h3>
                Last 5 · <FighterLink name={side.name} />
              </h3>
              {side.last5.length === 0 ? (
                <p className="calendar-quiet">—</p>
              ) : (
                <ul className="fight-last5">
                  {side.last5.map((row, rowIndex) => (
                    <li key={`${rowIndex}:${row}`}>{row}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
      ) : null}

      {show("lean") ? (
      <section className="calendar-day-section" aria-label="Lean">
        <h3>Lean</h3>
        <dl>
          {!hideEmpty || fight.lean ? (
            <Field
              label="Lean"
              value={
                fight.lean &&
                (personSlug(fight.lean) === personSlug(fight.A.name) ||
                  personSlug(fight.lean) === personSlug(fight.B.name)) ? (
                  <FighterLink name={fight.lean} />
                ) : (
                  fight.lean ?? "—"
                )
              }
            />
          ) : null}
          {!hideEmpty || fight.confidence ? (
            <Field label="Confidence" value={fight.confidence ?? "—"} />
          ) : null}
          {fight.tier ? <Field label="Tier" value={fight.tier} /> : null}
          {fight.stakePlan ? (
            <Field label="Stake" value={fight.stakePlan === "PLAY" ? "PLAY" : "free"} />
          ) : null}
          {fight.tierNote ? <Field label="KO gate" value={fight.tierNote} /> : null}
          {!hideEmpty || fight.why ? <Field label="Why" value={fight.why ?? "—"} /> : null}
          {fight.xFactor ? <Field label="X-factor" value={fight.xFactor} /> : null}
        </dl>
        {fight.edges.length > 0 ? (
          <ul className="fight-last5">
            {fight.edges.map((edge, index) => (
              <li key={`${index}:${edge}`}>{edge}</li>
            ))}
          </ul>
        ) : null}
      </section>
      ) : null}

      {show("odds") ? (
      <section className="calendar-day-section" aria-label="Odds">
        <h3>Odds check</h3>
        {!hideEmpty || bookPrices ? (
        <p className="calendar-section-note">
          Book prices are BestFightOdds moneylines. Coinbase and no-vig percents are the card file.
          Your ticket is the founder Coinbase Predict price.
        </p>
        ) : null}
        <div className="fight-split">
          <OddsColumn side={fight.A} bets={ticketsFor(fight.A.name)} hideEmpty={hideEmpty} />
          <OddsColumn side={fight.B} bets={ticketsFor(fight.B.name)} hideEmpty={hideEmpty} />
        </div>
      </section>
      ) : null}

      {show("highlights") ? (
      <section className="calendar-day-section" aria-label="Highlights">
        <h3>Highlights</h3>
        <ul className="fight-last5">
          {[fight.A, fight.B].filter((side) => !hideEmpty || side.highlight).map((side, index) => (
            <li key={`${side.slug}:${index}`}>
              <FighterLink name={side.name} />
              {side.highlight ? (
                <>
                  {": "}
                  <a href={side.highlight.url} rel="noreferrer">
                    {side.highlight.title}
                    {side.highlight.channel !== "—" ? ` · ${side.highlight.channel}` : ""}
                  </a>
                </>
              ) : (
                ": —"
              )}
            </li>
          ))}
        </ul>
      </section>
      ) : null}

      {show("stake") ? (
      <section className="calendar-day-section" aria-label="Stake">
        <h3>Founder stake</h3>
        {stakes.length === 0 ? (
          <p className="calendar-quiet">—</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {stakes.map((bet, index) => (
              <li key={`${bet.id}:${index}`} className="fight-card">
                <dl>
                  {bet.tier ? (
                    <Field
                      label="Tier"
                      value={
                        fight.tierNote &&
                        bet.tier === "STRONG" &&
                        fight.lean &&
                        personSlug(bet.pick) === personSlug(fight.lean)
                          ? fight.tier ?? "Pass"
                          : bet.tier
                      }
                    />
                  ) : null}
                  <Field label="Pick" value={bet.pick} />
                  {bet.hubLean ? <Field label="Hub lean" value={bet.hubLean} /> : null}
                  {typeof bet.agreesWithLean === "boolean" ? (
                    <Field label="Agrees" value={bet.agreesWithLean ? "yes" : "no"} />
                  ) : null}
                  <Field label="Stake" value={shownUsd(bet.stake)} />
                  <Field label="Odds" value={ticketOdds(bet)} />
                  <Field
                    label="Payout"
                    value={`${shownUsd(bet.payout)}${bet.estimated ? " est." : ""}`}
                  />
                  <Field label="Status" value={betStatusLabel(bet.status)} />
                  {bet.note ? <Field label="Note" value={bet.note} /> : null}
                  {bet.realizedPnl ? (
                    <Field label="P&L" value={shownSigned(bet.realizedPnl)} />
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
      ) : null}
    </div>
  );
}
