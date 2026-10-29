import Link from "next/link";
import { NodeFace, NodeFaceGrid } from "@/components/node-face";
import type { HomeFace, HomeFaceTone } from "@/lib/home-faces";
import type { FitnessStory, StoryBar, StoryChart, StoryFigure, StoryRange } from "@/lib/fitness-story";

const RANGES: readonly { id: StoryRange; label: string }[] = [
  { id: "w", label: "W" },
  { id: "m", label: "M" },
  { id: "y", label: "Y" },
];

function rangeHref(steps: StoryRange, runs: StoryRange): string {
  return `/n/fitness?steps=${steps}&runs=${runs}`;
}

function toneOf(value: string): HomeFaceTone {
  const match = /([+-]\d+(?:\.\d+)?)%/.exec(value);
  if (!match?.[1]) return "";
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return "";
  if (number > 0) return "up";
  if (number < 0) return "down";
  return "flat";
}

function isLive(value: string): boolean {
  const text = value.trim();
  if (!text || text === "not recorded" || text === "not connected yet") return false;
  return /\d/.test(text);
}

/** Drop the year and the word "updated" so the source and the day fit one tile line. */
function shortUpdated(value: string): string {
  return value.replace(/ CT$/, "").replace(/ \d{4}$/, "").replace(/^updated /, "");
}

/** One status line: source, approx, and the last update. The day count stays off the tile. */
function tileStatus(meta: string | null, fallback: string, headline = ""): string {
  if (!meta?.trim()) return fallback;
  const sources: string[] = [];
  const extras: string[] = [];
  let updated = "";
  for (const part of meta.split(" · ")) {
    const text = part.trim();
    if (!text || /^across \d+ days?$/.test(text)) continue;
    if (text === "approx" && headline.trim().startsWith("~")) continue;
    if (text.startsWith("from ")) {
      sources.push(...text.slice(5).split(/, and |, | and /).map((name) => name.trim()).filter(Boolean));
      continue;
    }
    if (text.startsWith("updated ")) {
      updated = shortUpdated(text);
      continue;
    }
    extras.push(text);
  }
  const line = [...sources, ...extras, updated].filter(Boolean).join(" · ");
  return line || fallback;
}

const GLYPH: Record<string, string> = {
  "average-steps": "steps",
  runs: "runs",
  miles: "miles",
  pace: "pace",
  "active-days": "active",
  "longest-run": "longest",
  "versus-last-week": "versus",
};

function figureHref(id: string): string {
  if (id === "average-steps") return "/n/fitness/steps";
  return "/n/fitness/runs";
}

function figureFace(periodId: string, item: StoryFigure): HomeFace {
  const live = isLive(item.value);
  const fallback = item.id === "active-days" && item.value !== "not recorded" ? "no run or workout" : "not recorded";
  return {
    id: `${periodId}-${item.id}`,
    glyph: GLYPH[item.id] ?? item.id,
    href: figureHref(item.id),
    name: item.label,
    headline: item.value,
    status: tileStatus(item.meta, fallback, item.value),
    live,
    tone: item.id === "versus-last-week" ? toneOf(item.value) : "",
  };
}

function liftingFace(story: FitnessStory): HomeFace {
  return {
    id: "lifting",
    glyph: "lifting",
    href: story.lifting.href,
    name: story.lifting.title,
    headline: story.lifting.value,
    status: tileStatus(story.lifting.meta, "No lifting feed yet."),
    live: isLive(story.lifting.value),
    tone: "",
  };
}

function manualFace(manual: FitnessStory["manual"]): HomeFace {
  if (!manual.text || manual.text === "not recorded") {
    const folded = manual.text === "";
    return {
      id: "manual",
      glyph: "manual",
      href: manual.href,
      name: "Manual import",
      headline: folded ? "in the totals" : "not recorded",
      status: folded ? "Manual import" : "not recorded",
      live: false,
      tone: "",
    };
  }
  const rows = manual.text.split("; ").map((row) => row.trim()).filter(Boolean);
  const first = rows[0] ?? manual.text;
  const bits = first.split(" · ").map((bit) => bit.trim()).filter(Boolean);
  const headline = bits[0] || "Manual import";
  const rest = bits.slice(1);
  if (!rest.includes("Manual import")) rest.push("Manual import");
  if (rows.length > 1) rest.push(`${rows.length} written down`);
  return {
    id: "manual",
    glyph: "manual",
    href: manual.href,
    name: "Manual import",
    headline,
    status: rest.join(" · "),
    live: isLive(headline),
    tone: "",
  };
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

function analyticsFace(line: { headline: string; status: string } | null): HomeFace {
  return {
    id: "analytics",
    glyph: "analytics",
    href: "/n/fitness/analytics",
    name: "Analytics",
    headline: line?.headline ?? "not recorded",
    status: line?.status ?? "Resonance Analytics",
    live: Boolean(line && line.headline !== "not recorded"),
    tone: "",
  };
}

export function FitnessStoryView({
  story,
  stepsRange,
  runsRange,
  analytics = null,
}: {
  story: FitnessStory;
  stepsRange: StoryRange;
  runsRange: StoryRange;
  analytics?: { headline: string; status: string } | null;
}) {
  return (
    <div className="fitness-story">
      {story.periods.map((period) => {
        const faces = period.figures.map((item) => figureFace(period.id, item));
        if (period.id === "week") {
          faces.push(liftingFace(story), manualFace(story.manual), analyticsFace(analytics));
        }
        return (
          <section key={period.id} className="fitness-period" aria-label={period.title}>
            <header className="fitness-period-head">
              <h2>{period.title}</h2>
              <p>{period.span}</p>
            </header>
            <NodeFaceGrid label={period.title} count={faces.length}>
              {faces.map((face) => (
                <NodeFace key={face.id} face={face} />
              ))}
            </NodeFaceGrid>
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
        );
      })}
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
    </div>
  );
}
