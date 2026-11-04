import { OBS_HEADER_NAME, OBS_URL } from "@/lib/obs";

export function ObsGuide() {
  return (
    <div className="fitness-setup">
      <h2 className="node-ticker">OBS</h2>
      <p>The PC posts one recording when OBS saves a file. The same file updates that row. A new file is kept.</p>
      <dl className="fitness-log">
        <div>
          <dt>URL</dt>
          <dd>{OBS_URL}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>POST</dd>
        </div>
        <div>
          <dt>Header</dt>
          <dd>{OBS_HEADER_NAME}</dd>
        </div>
        <div>
          <dt>Body</dt>
          <dd>JSON</dd>
        </div>
      </dl>
      <p>Required fields: fileName, sizeBytes, createdAt, and folder. durationSec is optional. Gear shows the latest recordings.</p>
    </div>
  );
}
