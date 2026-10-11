import type { CSSProperties } from "react";
import {
  lotBarPopoverLines,
  lotBarValueLabel,
  type LotBar,
  type LotBarModel,
} from "@/lib/lot-bars";
import {
  filterLotBars,
  LOT_BAR_CROWDED_AT,
  LOT_BAR_CROWDED_MAX,
  LOT_RANGES,
  parseLotRange,
  type LotRange,
} from "@/lib/lot-range";

/** Plot box. The zero line sits in the middle. Dates live outside this box. */
const PLOT_H = 140;
const PAD = 4;
const HALF = (PLOT_H - PAD * 2) / 2;
const ZERO = PAD + HALF;
const LABEL_H = 13;
const MAX_BAR = 48;
/** Sparkline slot on a parent card. Tall enough to read, short enough to sit under the price. */
const COMPACT_H = 42;
const COMPACT_PAD = 3;

function barGeometry(
  bars: readonly LotBar[],
  plotH = PLOT_H,
  pad = PAD,
): { top: number; height: number; labelTop: number }[] {
  const half = (plotH - pad * 2) / 2;
  const zero = pad + half;
  const peak = Math.max(...bars.map((bar) => Math.abs(bar.magnitude)), 0);
  return bars.map((bar) => {
    const span = peak === 0 ? 2 : (Math.abs(bar.magnitude) / peak) * half;
    const height = Math.max(span, 2);
    const top = bar.magnitude >= 0 ? zero - height : zero;
    const bottom = top + height;
    let labelTop: number;
    if (bar.magnitude >= 0) {
      labelTop = top - LABEL_H - 1;
    } else if (height >= LABEL_H + 2) {
      labelTop = bottom - LABEL_H - 1;
    } else {
      labelTop = top - LABEL_H - 1;
    }
    return { top, height, labelTop };
  });
}

function compactAria(bars: readonly LotBar[], label: string): string {
  const percents = bars
    .map((bar) => lotBarValueLabel(bar, true))
    .filter((line): line is string => Boolean(line));
  return [label, ...percents].join(", ");
}

function badgeText(bar: LotBar): string | null {
  if (bar.sequence < 1) return null;
  return bar.first ? "First buy" : `#${bar.sequence}`;
}

function rangeHref(range: LotRange): string {
  const hash = "#lot-bars";
  return range === "All" ? `?${hash}` : `?range=${range}${hash}`;
}

function LotRangeSwitch({ selected }: { selected: LotRange }) {
  return (
    <nav className="lot-range" aria-label="Buy range">
      {LOT_RANGES.map((item) => {
        const on = item === selected;
        return (
          <a
            key={item}
            href={rangeHref(item)}
            className={on ? "is-selected" : undefined}
            aria-current={on ? "true" : undefined}
          >
            {item}
          </a>
        );
      })}
    </nav>
  );
}

export function LotBarChart({
  model,
  publicMode = false,
  compact = false,
  label,
  range,
  now,
}: {
  model: LotBarModel;
  publicMode?: boolean;
  /** Parent-card slot: bars only, no labels, badges, or separate taps. */
  compact?: boolean;
  label: string;
  /** `?range=` value. Unknown values are All. Ignored on a compact card. */
  range?: string | null;
  /** Clock for the Chicago window. Defaults to the request time. */
  now?: Date;
}) {
  if (compact) {
    const bars = model.bars.filter((bar) => !bar.sold);
    if (bars.length === 0) return null;
    const drawn = barGeometry(bars, COMPACT_H, COMPACT_PAD);
    const zero = COMPACT_PAD + (COMPACT_H - COMPACT_PAD * 2) / 2;
    return (
      <figure
        className="position-chart lot-bars is-compact"
        aria-label={publicMode ? compactAria(bars, label) : label}
      >
        <div className="lot-bars-scroll">
          <div className="lot-bars-cols">
            {bars.map((bar, index) => {
              const box = drawn[index];
              if (!box) return null;
              const tone = `is-${bar.tone}`;
              return (
                <div
                  key={bar.id}
                  className={`lot-bar-col lot-bar ${tone}`}
                  data-tone={bar.tone}
                >
                  <div
                    className="lot-bar-plot"
                    style={{ "--lot-zero": `${zero}px`, height: COMPACT_H } as CSSProperties}
                  >
                    <span
                      className={`lot-bar-fill ${tone}`}
                      style={{ top: box.top, height: box.height }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </figure>
    );
  }
  if (model.bars.length === 0 && !model.caption) return null;
  if (model.bars.length === 0) {
    return (
      <figure className="position-chart lot-bars" aria-label={label}>
        {model.caption ? <figcaption className="position-caption">{model.caption}</figcaption> : null}
      </figure>
    );
  }
  const selected = parseLotRange(range);
  const shown = filterLotBars(model.bars, selected, now ?? new Date());
  const crowded = shown.length >= LOT_BAR_CROWDED_AT;
  const drawn = barGeometry(shown);
  return (
    <figure
      id="lot-bars"
      className={`position-chart lot-bars${crowded ? " is-crowded" : ""}`}
      aria-label={label}
      data-range={selected}
      data-crowded={crowded ? "true" : "false"}
    >
      <LotRangeSwitch selected={selected} />
      {shown.length > 0 ? (
        <div className="lot-bars-scroll">
          <div
            className="lot-bars-cols"
            style={{ minWidth: crowded ? "100%" : `max(100%, ${shown.length * 44}px)` }}
          >
            {shown.map((bar, index) => {
              const box = drawn[index];
              if (!box) return null;
              const tone = `is-${bar.tone}`;
              const badge = crowded ? (bar.first ? "First buy" : null) : badgeText(bar);
              const value = crowded ? null : lotBarValueLabel(bar, publicMode);
              const lines = lotBarPopoverLines(bar, publicMode);
              const name = lines.join(", ");
              const marked = bar.partial || bar.sold;
              return (
                <div
                  key={bar.id}
                  className={`lot-bar-col lot-bar ${tone}${bar.first ? " is-first" : ""}${bar.sold ? " is-sold" : ""}`}
                  data-tone={bar.tone}
                  data-partial={bar.partial ? "true" : "false"}
                  data-sold={bar.sold ? "true" : "false"}
                  data-first={bar.first ? "true" : "false"}
                  data-badge={badge ?? ""}
                  data-day={bar.day}
                >
                  <div className="lot-bar-head">
                    {badge ? <span className="lot-bar-badge">{badge}</span> : null}
                    {!crowded && bar.sold ? <span className="lot-bar-tick">Sold</span> : null}
                    {!crowded && bar.partial ? <span className="lot-bar-tick">partial</span> : null}
                  </div>
                  <div className="lot-bar-plot" style={{ "--lot-zero": `${ZERO}px` } as CSSProperties}>
                    {value ? (
                      <span className={`lot-bar-value ${tone}`} style={{ top: box.labelTop }}>
                        {value}
                      </span>
                    ) : null}
                    <span
                      className={`lot-bar-fill ${tone}${bar.first ? " is-first" : ""}${marked ? " is-marked" : ""}${bar.sold ? " is-sold" : ""}`}
                      style={{ top: box.top, height: box.height, maxWidth: crowded ? LOT_BAR_CROWDED_MAX : MAX_BAR }}
                    />
                  </div>
                  {crowded ? null : <div className="lot-bar-date">{bar.axisLabel}</div>}
                  {bar.href ? (
                    <a href={bar.href} className="lot-bar-hit" aria-label={name}>
                      <span className="sr-only">{name}</span>
                    </a>
                  ) : (
                    <details className="lot-bar-hit" name="lot-bar">
                      <summary aria-label={name}>
                        <span className="sr-only">{name}</span>
                      </summary>
                      <div className="lot-bar-pop" role="group">
                        {lines.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="lot-bars-empty" role="status">
          No buys in this range
        </p>
      )}
      {model.caption ? <figcaption className="position-caption">{model.caption}</figcaption> : null}
    </figure>
  );
}
