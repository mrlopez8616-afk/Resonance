import Link from "next/link";
import type { FitnessStory, StoryBar, StoryChart, StoryRange } from "@/lib/fitness-story";

const RANGES: readonly { id: StoryRange; label: string }[] = [
  { id: "w", label: "W" },
  { id: "m", label: "M" },
  { id: "y", label: "Y" },
];

function rangeHref(steps: StoryRange, runs: StoryRange): string {
  return `/n/fitness?steps=${steps}&runs=${runs}`;
}

function StoryBars({ bars, label }: { bars: readonly StoryBar[]; label: string }) {
  const width = 640;
  const height = 168;
  const max = Math.max(...bars.map((bar) => bar.value), 0.1);
  const slot = width / bars.length;
  const room = 112;
  const baseline = 128;
  const tickClass = bars.length > 12 ? "home-tick home-tick-compact" : "home-tick";
  const caption = bars.map((bar) => `${bar.label} ${bar.caption}`).join(", ");
  return (
    <div className="home-visual fitness-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}, ${caption}`}>
        {bars.map((bar, index) => {
          const barW = Math.min(slot * 0.62, 28);
          const x = index * slot + (slot - barW) / 2;
          const heightPx = Math.max((bar.value / max) * room, 2);
          const y = baseline - heightPx;
          const showLabel = bars.length <= 10 || index === 0 || index === bars.length - 1;
          return (
            <g key={bar.id}>
              <title>{`${bar.label} ${bar.caption}`}</title>
              <rect x={x} y={y} width={barW} height={heightPx} rx="1.5" className="home-step" />
              {showLabel ? (
                <text x={index * slot + slot / 2} y={height - 8} textAnchor="middle" className={tickClass}>
                  {bar.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ChartBlock({
  chart,
  stepsRange,
  runsRange,
}: {
  chart: StoryChart;
  stepsRange: StoryRange;
  runsRange: StoryRange;
}) {
  return (
    <section className="fitness-chart-block" aria-label={chart.title}>
      <div className="fitness-chart-head">
        <h2>
          <Link href={chart.href}>{chart.title}</Link>
        </h2>
        <nav className="lot-range" aria-label={`${chart.title} range`}>
          {RANGES.map((range) => {
            const selected = chart.range === range.id;
            const href = rangeHref(
              chart.id === "steps" ? range.id : stepsRange,
              chart.id === "runs" ? range.id : runsRange,
            );
            return (
              <Link key={range.id} href={href} className={selected ? "is-selected" : undefined} aria-current={selected ? "true" : undefined}>
                {range.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {chart.bars.length > 0 ? <StoryBars bars={chart.bars} label={chart.title} /> : <p className="fitness-empty">{chart.empty}</p>}
    </section>
  );
}

export function FitnessStoryView({
  story,
  stepsRange,
  runsRange,
}: {
  story: FitnessStory;
  stepsRange: StoryRange;
  runsRange: StoryRange;
}) {
  return (
    <div className="fitness-story">
      {story.periods.map((period) => (
        <section key={period.id} className="fitness-period" aria-label={period.title}>
          <header className="fitness-period-head">
            <h2>{period.title}</h2>
            <p>{period.span}</p>
          </header>
          <div className="fitness-figures">
            {period.figures.map((item) => (
              <article key={item.id} className="fitness-figure">
                <h3>{item.label}</h3>
                <p className="fitness-figure-value">{item.value}</p>
                {item.meta ? <p className="fitness-figure-meta">{item.meta}</p> : null}
              </article>
            ))}
          </div>
          {period.aside ? <p className="fitness-aside">{period.aside}</p> : null}
          {period.notes.length > 0 ? (
            <div className="fitness-notes">
              {period.notes.map((note) =>
                /heart/i.test(note) ? (
                  <Link key={note} href="/n/fitness/heart" className="fitness-note">
                    {note}
                  </Link>
                ) : (
                  <p key={note} className="fitness-note">
                    {note}
                  </p>
                ),
              )}
            </div>
          ) : null}
        </section>
      ))}
      <ChartBlock chart={story.steps} stepsRange={stepsRange} runsRange={runsRange} />
      <ChartBlock chart={story.runs} stepsRange={stepsRange} runsRange={runsRange} />
      <section className="fitness-recent" aria-label="Recent runs">
        <h2>
          <Link href="/n/fitness/runs">Recent runs</Link>
        </h2>
        {story.recent.length === 0 ? (
          <p className="fitness-empty">not recorded</p>
        ) : (
          <ol>
            {story.recent.map((run) => (
              <li key={run.id}>
                <span className="fitness-run-date">{run.date}</span>
                <span className="fitness-run-miles">{run.miles}</span>
                {run.pace ? <span>{run.pace}</span> : null}
                <span className="fitness-run-source">{run.source}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="fitness-lifting" aria-label="Lifting">
        <Link href={story.lifting.href}>
          <h2>{story.lifting.title}</h2>
          <p className="fitness-figure-value">{story.lifting.value}</p>
          {story.lifting.meta ? <p className="fitness-figure-meta">{story.lifting.meta}</p> : null}
        </Link>
      </section>
      <p className="fitness-manual-line">
        <Link href={story.manual.href}>Manual import</Link>
        {story.manual.text ? <span> · {story.manual.text}</span> : null}
      </p>
    </div>
  );
}
