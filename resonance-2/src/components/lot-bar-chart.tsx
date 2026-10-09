import {
  lotBarPopoverLines,
  type LotBar,
  type LotBarModel,
} from "@/lib/lot-bars";

const COLUMN = 78;
const HEIGHT = 196;
const PAD_TOP = 36;
const AXIS = 178;
const ZERO = 108;

function barGeometry(bars: readonly LotBar[]): { x: number; y: number; height: number }[] {
  const peak = Math.max(...bars.map((bar) => Math.abs(bar.magnitude)), 0);
  const half = ZERO - PAD_TOP;
  return bars.map((bar, index) => {
    const span = peak === 0 ? 2 : (Math.abs(bar.magnitude) / peak) * half;
    const height = Math.max(span, 2);
    const y = bar.magnitude >= 0 ? ZERO - height : ZERO;
    return { x: index * COLUMN, y, height };
  });
}

function badgeText(bar: LotBar): string | null {
  if (bar.sequence < 1) return null;
  return bar.first ? "First buy" : `#${bar.sequence}`;
}

export function LotBarChart({
  model,
  publicMode = false,
  label,
}: {
  model: LotBarModel;
  publicMode?: boolean;
  label: string;
}) {
  if (model.bars.length === 0 && !model.caption) return null;
  const bars = model.bars;
  const width = Math.max(bars.length * COLUMN, COLUMN);
  const drawn = barGeometry(bars);
  return (
    <figure className="position-chart lot-bars">
      {bars.length > 0 ? (
        <div className="lot-bars-scroll">
          <div className="lot-bars-track" style={{ width }}>
            <svg viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={label} width={width} height={HEIGHT}>
              <defs>
                <pattern id="lot-bar-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
                  <line x1="0" y1="0" x2="0" y2="6" className="lot-bar-hatch-line" />
                </pattern>
              </defs>
              <line x1="0" x2={width} y1={ZERO} y2={ZERO} className="lot-bars-zero" />
              {bars.map((bar, index) => {
                const box = drawn[index];
                if (!box) return null;
                const tone = `is-${bar.tone}`;
                const badge = badgeText(bar);
                return (
                  <g
                    key={bar.id}
                    className={`lot-bar ${tone}${bar.first ? " is-first" : ""}${bar.sold ? " is-sold" : ""}`}
                    data-tone={bar.tone}
                    data-partial={bar.partial ? "true" : "false"}
                    data-sold={bar.sold ? "true" : "false"}
                    data-first={bar.first ? "true" : "false"}
                    data-badge={badge ?? ""}
                    data-day={bar.day}
                  >
                    <rect x={box.x + 22} y={box.y} width={28} height={box.height} className={`lot-bar-fill ${tone}`} />
                    {bar.partial || bar.sold ? (
                      <rect x={box.x + 22} y={box.y} width={28} height={box.height} className="lot-bar-partial" />
                    ) : null}
                    {bar.first ? (
                      <rect x={box.x + 19} y={box.y - 2} width={34} height={box.height + 4} className="lot-bar-outline" />
                    ) : null}
                    {badge ? (
                      <text x={box.x + COLUMN / 2} y={16} textAnchor="middle" className="lot-bar-badge">
                        {badge}
                      </text>
                    ) : null}
                    {bar.sold ? (
                      <text x={box.x + COLUMN / 2} y={30} textAnchor="middle" className="lot-bar-tick">
                        Sold
                      </text>
                    ) : null}
                    {bar.partial ? (
                      <text x={box.x + COLUMN / 2} y={30} textAnchor="middle" className="lot-bar-tick">
                        partial
                      </text>
                    ) : null}
                    <text x={box.x + COLUMN / 2} y={AXIS} textAnchor="middle" className="lot-bar-date">
                      {bar.axisLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="lot-bars-hits">
              {bars.map((bar) => {
                const lines = lotBarPopoverLines(bar, publicMode);
                const name = lines.join(", ");
                if (bar.href) {
                  return (
                    <a key={bar.id} href={bar.href} className="lot-bar-hit" aria-label={name} style={{ width: COLUMN }}>
                      <span className="sr-only">{name}</span>
                    </a>
                  );
                }
                return (
                  <details key={bar.id} className="lot-bar-hit" name="lot-bar" style={{ width: COLUMN }}>
                    <summary aria-label={name}>
                      <span className="sr-only">{name}</span>
                    </summary>
                    <div className="lot-bar-pop" role="group">
                      {lines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {model.caption ? <figcaption className="position-caption">{model.caption}</figcaption> : null}
    </figure>
  );
}
