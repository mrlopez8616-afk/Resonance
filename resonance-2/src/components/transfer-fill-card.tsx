import { formatFillTime } from "@/lib/fills";
import type { RewardFill, TransferFill } from "@/data/fills";

export function Field({
  label,
  value,
  tone,
  wrap = "normal",
}: {
  label: string;
  value: string;
  tone?: "buy" | "sell" | "ok";
  wrap?: "normal" | "id";
}) {
  const toneClass =
    tone === "buy"
      ? "text-[color:var(--buy)]"
      : tone === "sell"
        ? "text-[color:var(--sell)]"
        : tone === "ok"
          ? "text-[color:var(--ok)]"
          : "text-[color:var(--text)]";
  const wrapClass = wrap === "id" ? "break-all" : "break-words";

  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-baseline gap-x-3 border-t border-[color:var(--border)] py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[5.75rem_minmax(0,1fr)]">
      <dt className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {label}
      </dt>
      <dd
        className={`min-w-0 font-[family-name:var(--font-geist-mono)] text-[0.92rem] leading-6 ${wrapClass} ${toneClass}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function RewardFillCard({ fill }: { fill: RewardFill }) {
  return (
    <article className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-4 sm:px-5">
      <dl>
        <Field label="time" value={formatFillTime(fill.time)} />
        <Field label="symbol" value={fill.symbol} />
        <Field label="kind" value="reward" tone="ok" />
        <Field label="quantity" value={fill.quantity} />
        <Field label="sleeve" value={fill.sleeve} />
        <Field label="id" value={fill.orderId} wrap="id" />
        {fill.note ? <Field label="note" value={fill.note} /> : null}
      </dl>
    </article>
  );
}

export function TransferFillCard({ fill }: { fill: TransferFill }) {
  return (
    <article className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-4 sm:px-5">
      <dl>
        <Field label="time" value={formatFillTime(fill.time)} />
        <Field label="symbol" value={fill.symbol} />
        <Field label="kind" value="transfer" tone="ok" />
        <Field label="quantity" value={fill.quantity} />
        {fill.venue ? <Field label="venue" value={fill.venue} /> : null}
        <Field label="sleeves" value={`${fill.fromSleeve} → ${fill.toSleeve}`} />
        <Field label="id" value={fill.orderId} wrap="id" />
        {fill.note ? <Field label="note" value={fill.note} /> : null}
      </dl>
    </article>
  );
}
