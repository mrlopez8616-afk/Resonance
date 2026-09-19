import { formatFillTime } from "@/lib/fills";
import type { Fill } from "@/data/fills";

function Field({
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

export function FillCard({ fill }: { fill: Fill }) {
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

export function FillLog({ fills }: { fills: Fill[] }) {
  if (fills.length === 0) {
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
        <li key={fill.idempotencyKey ?? `${fill.venue ?? "seed"}:${fill.orderId}`}>
          <FillCard fill={fill} />
        </li>
      ))}
    </ol>
  );
}
