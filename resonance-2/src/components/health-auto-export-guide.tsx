import { HEALTH_AUTO_EXPORT_HEADER_NAME, HEALTH_AUTO_EXPORT_URL } from "@/lib/health-auto-export";

const FITNESS_SYNC_VALUE =
  "The value is the Fitness sync token from Settings -> Security. On Authorization, a leading Bearer or Token is ignored. A leading Bearer and surrounding spaces are ignored on the other headers.";

const BACKFILL_STEP =
  "Paste the Fitness sync token (Settings -> Security) into the X-Resonance-Token header on both automations.";

export function HealthAutoExportGuide() {
  return (
    <div className="fitness-setup">
      <h2 className="node-ticker">Health Auto Export</h2>
      <p>Two automations. Same URL, JSON, export version 2. Any one of these headers.</p>
      <dl className="fitness-log">
        <div>
          <dt>URL</dt>
          <dd>{HEALTH_AUTO_EXPORT_URL}</dd>
        </div>
        <div>
          <dt>Export format</dt>
          <dd>JSON</dd>
        </div>
        <div>
          <dt>Export version</dt>
          <dd>2</dd>
        </div>
        <div>
          <dt>Headers</dt>
          <dd>
            Authorization: Bearer or Token, {HEALTH_AUTO_EXPORT_HEADER_NAME}, X-Fitness-Token, X-Api-Key,
            Api-Key, Apikey, X-Auth-Token, X-Access-Token, X-Token, Token, or X-Health-Token
          </dd>
        </div>
      </dl>
      <p>{FITNESS_SYNC_VALUE}</p>
      <h3>Steps</h3>
      <p>Health metrics. Select step_count only. Aggregate data on. Interval 1 day.</p>
      <p>Optional. Also select resting_heart_rate, one value per day. A later export replaces that day.</p>
      <h3>Workouts</h3>
      <p>Workouts on. Include Workout Metrics ON, Time Grouping Minutes, Route OFF.</p>
      <h3>Batch requests</h3>
      <p>On, for both automations. Each request must stay under 4.5 MB.</p>
      <h3>Backfill</h3>
      <ol className="fitness-log">
        <li>{BACKFILL_STEP}</li>
        <li>Turn Batch Requests on before the manual export.</li>
        <li>Export the full history, from the earliest day in Apple Health through today.</li>
        <li>
          Daily step totals usually fit in one request. If a request is rejected as too large, export one
          year at a time, oldest first, January 1 through December 31. If a workout year is still too
          large, export one quarter at a time.
        </li>
        <li>Start and end each export on a calendar day so one day is not split across requests.</li>
        <li>
          Overlapping ranges are safe. A Central Time day replaces that day. A workout id replaces that workout.
        </li>
        <li>Leave both automations on after the backfill.</li>
      </ol>
    </div>
  );
}
