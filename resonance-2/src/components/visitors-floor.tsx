import type { VisitorSummary } from "@/lib/visitors-store";

export function VisitorsFloor({ summary }: { summary: VisitorSummary }) {
  const peak = Math.max(1, ...summary.days.map((day) => day.views));
  return (
    <section className="visitors-floor" aria-label="Visitors">
      <div className="visitors-stats">
        <p>
          <span className="visitors-value">{summary.todayVisitors}</span>
          <span className="visitors-label">today</span>
        </p>
        <p>
          <span className="visitors-value">{summary.totalVisitors}</span>
          <span className="visitors-label">total visitors</span>
        </p>
        <p>
          <span className="visitors-value">{summary.totalViews}</span>
          <span className="visitors-label">page views</span>
        </p>
      </div>
      <svg className="visitors-chart" viewBox="0 0 280 88" role="img" aria-label="Daily page views">
        {summary.days.map((day, index) => {
          const height = Math.max(2, Math.round((day.views / peak) * 64));
          const x = 8 + index * 19;
          return <rect key={day.day} x={x} y={76 - height} width="12" height={height} rx="2" />;
        })}
      </svg>
      {summary.totalViews === 0 ? (
        <p className="parent-empty" role="status">
          No data yet
        </p>
      ) : null}
    </section>
  );
}
