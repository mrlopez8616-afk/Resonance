import type { ReactNode } from "react";
import Link from "next/link";
import { LockIcon } from "@/components/icons";
import {
  EMPTY_CARD_NOTE,
  EQUAL_CARD_CLASS,
  cardSpanClass,
  type CardSpan,
} from "@/lib/node-layout";

/**
 * 12-column grid. Key numbers span 3, trends span 6, lists span 12.
 * Phone and narrow widths restack in the stylesheet. Cards stretch to one height.
 */
export function NodeGrid({ children }: { children: ReactNode }) {
  return <div className="node-grid node-grid-12">{children}</div>;
}

function CardLabel({ label }: { label: string }) {
  return <p className="node-card-label">{label}</p>;
}

/**
 * Equal-height card. `money` keeps the founder rule: the dollar value is the
 * large line and the live price is the smaller line under it.
 * A locked card keeps this box and shows a lock. The value is not rendered.
 */
export function StatCard({
  label,
  value,
  detail,
  span = "stat",
  href,
  titleHref,
  locked = false,
  money = false,
  id,
  children,
}: {
  label: string;
  value?: string | null;
  detail?: string | null;
  span?: CardSpan;
  href?: string;
  titleHref?: string;
  locked?: boolean;
  money?: boolean;
  /** Anchor for a lesson link that points at this card. */
  id?: string;
  children?: ReactNode;
}) {
  const className = `${EQUAL_CARD_CLASS} ${cardSpanClass(span)}`;
  const labelNode = <CardLabel label={label} />;
  const valueNode =
    value && titleHref && !href && !locked ? (
      <Link href={titleHref} className="node-card-title-link">
        {value}
      </Link>
    ) : (
      value
    );
  let body: ReactNode;
  if (locked) {
    body = (
      <p className="node-card-lock" data-lock-badge>
        <LockIcon size={18} />
        <span className="sr-only">Private</span>
      </p>
    );
  } else if (money) {
    body = (
      <>
        {value ? <p className="node-card-value">{value}</p> : null}
        {detail ? <p className="node-card-price">{detail}</p> : null}
      </>
    );
  } else {
    body = (
      <>
        {value ? <p className="node-card-value">{valueNode}</p> : null}
        {detail ? <p className="node-card-detail">{detail}</p> : null}
        {children}
      </>
    );
  }
  const inner = (
    <>
      {labelNode}
      {body}
    </>
  );
  return (
    <article
      className={className}
      id={id}
      data-span={span}
      data-card="stat"
      data-locked={locked ? "true" : undefined}
      aria-label={locked ? `${label}, private` : undefined}
    >
      {href && !locked ? (
        <Link href={href} className="node-card-link">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </article>
  );
}

/** Boxed empty metric. Same face as a StatCard: label, a dash, and the connect line. */
export function EmptyCard({
  label,
  span = "stat",
  setupHref,
  setupLabel,
}: {
  label: string;
  span?: CardSpan;
  setupHref?: string | null;
  setupLabel?: string | null;
}) {
  return (
    <article className={`${EQUAL_CARD_CLASS} ${cardSpanClass(span)}`} data-span={span} data-card="empty">
      <p className="node-card-label">{label}</p>
      <p className="node-card-value">—</p>
      <p className="node-card-detail">{EMPTY_CARD_NOTE}</p>
      {setupHref ? (
        <p className="node-card-setup">
          <a href={setupHref}>{setupLabel || "Connect"}</a>
        </p>
      ) : null}
    </article>
  );
}
