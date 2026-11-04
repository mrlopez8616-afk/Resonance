import { PRINTER_HEADER_NAME, PRINTER_URL } from "@/lib/printer";

export function PrinterGuide() {
  return (
    <div className="fitness-setup">
      <h2 className="node-ticker">Printer</h2>
      <p>The PC posts the HP supplies JSON a few times a day. Each reading is kept. The node shows the newest one.</p>
      <dl className="fitness-log">
        <div>
          <dt>URL</dt>
          <dd>{PRINTER_URL}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>POST</dd>
        </div>
        <div>
          <dt>Header</dt>
          <dd>{PRINTER_HEADER_NAME}</dd>
        </div>
        <div>
          <dt>Body</dt>
          <dd>JSON</dd>
        </div>
      </dl>
      <p>
        Send the suppliesPublic body: suppliesList with supplyType, supplyColorCode, percentLifeDisplay,
        levelState, supplyState, and selectabilityNumber. printerModel and readAt are optional.
      </p>
    </div>
  );
}
