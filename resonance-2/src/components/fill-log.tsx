import Link from "next/link";
import { fillRowKey, formatFillTime } from "@/lib/fills";
import type { BetFill, Fill } from "@/data/fills";
import { betStatusLabel, formatUsd } from "@/lib/bets";
import { Field, TransferFillCard } from "@/components/transfer-fill-card";

export { TransferFillCard } from "@/components/transfer-fill-card";

function venueLabel(venue: string): string {
  if (venue === "coinbase-predict") return "Coinbase Predict";
  return venue;
}

function oddsLabel(fill: BetFill): string {
  const pct = `${fill.oddsPct}%`;
  return fill.estimated ? `~${pct}` : pct;
}

export function BetFillCard({ fill }: { fill: BetFill }) {
  const payout = fill.estimated ? `${formatUsd(fill.payout)} est.` : formatUsd(fill.payout);
  return (
    <article className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-4 sm:px-5">
      <dl>
        <Field label="time" value={formatFillTime(fill.time)} />
        <Field label="ticker" value={fill.symbol} />
        <Field label="kind" value="bet" tone="ok" />
        <Field label="venue" value={venueLabel(fill.venue)} />
        <Field label="event" value={fill.event} />
        <Field label="fight" value={fill.fight} />
        <Field label="pick" value={fill.pick} />
        {fill.hubLean ? <Field label="hub lean" value={fill.hubLean} /> : null}
        {typeof fill.agreesWithLean === "boolean" ? (
          <Field
            label="lean"
            value={fill.agreesWithLean ? "with" : "against"}
            tone={fill.agreesWithLean ? "ok" : "sell"}
          />
        ) : null}
        <Field label="stake" value={formatUsd(fill.stake)} />
        <Field label="odds" value={oddsLabel(fill)} />
        <Field label="payout" value={payout} />
        <Field
          label="status"
          value={betStatusLabel(fill.betStatus)}
          tone={fill.betStatus === "lost" ? "sell" : fill.betStatus === "sold" ? undefined : "ok"}
        />
        {fill.realizedPnl ? (
          <Field label="P&L" value={formatUsd(fill.realizedPnl)} />
        ) : null}
        <Field label="id" value={fill.orderId} wrap="id" />
        {fill.note ? <Field label="note" value={fill.note} /> : null}
      </dl>
      <p className="mt-3 text-sm">
        <Link href={`/fights/ufc-332/${fill.fightSlug}`} className="text-[color:var(--live)]">
          Open fight
        </Link>
      </p>
    </article>
  );
}

export function FillCard({ fill }: { fill: Fill }) {
  if (fill.kind === "bet") return <BetFillCard fill={fill} />;
  if (fill.kind === "transfer") return <TransferFillCard fill={fill} />;
  return (
    <article className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-4 sm:px-5">
      <dl>
        <Field label="time" value={formatFillTime(fill.time)} />
        <Field label="symbol" value={fill.symbol} />
        <Field
          label="side"
          value={fill.side}
          tone={fill.side === "sell" ? "sell" : "buy"}
        />
        <Field label="quantity" value={fill.quantity} />
        <Field label="price" value={fill.price} />
        {fill.venue ? <Field label="venue" value={fill.venue} /> : null}
        {fill.sleeve ? <Field label="sleeve" value={fill.sleeve} /> : null}
        <Field label="orderId" value={fill.orderId} wrap="id" />
        <Field label="result" value={fill.result} tone="ok" />
        {fill.note ? <Field label="note" value={fill.note} /> : null}
      </dl>
    </article>
  );
}

export function FillLog({
  fills,
  empty = "store",
}: {
  fills: Fill[];
  empty?: "store" | "desk";
}) {
  if (fills.length === 0) {
    if (empty === "desk") {
      return (
        <p className="rounded-xl border border-dashed border-[color:var(--border)] px-4 py-8 text-center text-sm leading-6 text-[color:var(--muted)]">
          No fills match this desk. The store is unchanged.
        </p>
      );
    }

    return (
      <p className="rounded-xl border border-dashed border-[color:var(--border)] px-4 py-8 text-center text-sm leading-6 text-[color:var(--muted)]">
        No fills in the durable store or{" "}
        <code className="font-[family-name:var(--font-geist-mono)] text-[color:var(--text)]">
          src/data/fills.ts
        </code>
        .
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {fills.map((fill) => (
        <li key={fillRowKey(fill)}>
          <FillCard fill={fill} />
        </li>
      ))}
    </ol>
  );
}
