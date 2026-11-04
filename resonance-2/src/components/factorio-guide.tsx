import { FACTORIO_HEADER_NAME, FACTORIO_URL } from "@/lib/factorio";

export function FactorioGuide() {
  return (
    <div className="fitness-setup">
      <h2 className="node-ticker">Factorio</h2>
      <p>The PC script posts one JSON snapshot. The same tick replaces that row. A new tick is kept.</p>
      <dl className="fitness-log">
        <div>
          <dt>URL</dt>
          <dd>{FACTORIO_URL}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>POST</dd>
        </div>
        <div>
          <dt>Header</dt>
          <dd>{FACTORIO_HEADER_NAME}</dd>
        </div>
        <div>
          <dt>Body</dt>
          <dd>JSON</dd>
        </div>
      </dl>
      <p>
        Required fields: tick, play_hours, and force.rockets_launched plus force.technologies_researched.
        Also send players, force.current_research, force.research_progress, production, consumption,
        science_produced, and machines. The bridge file is the body as posted.
      </p>
    </div>
  );
}
