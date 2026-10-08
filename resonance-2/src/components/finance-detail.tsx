import { AmountBars, AmountLine, CashFlowBars } from "@/components/home-visual";
import { FinanceAsOf } from "@/components/finance-floor";
import type { FinanceDetailModel, FinanceTableModel } from "@/lib/finance/view";

function FinanceTable({ table }: { table: FinanceTableModel }) {
  if (table.rows.length === 0 || table.columns.length === 0) return null;
  return (
    <div className="fight-table-wrap">
      <h3 className="finance-table-title">{table.title}</h3>
      <table className="fight-table">
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column || "mark"} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={`${table.title}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${table.title}-${index}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FinanceDetail({
  detail,
  asOf,
  stale,
}: {
  detail: FinanceDetailModel;
  asOf: string;
  stale: boolean;
}) {
  return (
    <section className="finance-detail" aria-label={`${detail.title} detail`}>
      <FinanceAsOf asOf={asOf} stale={stale} />
      <header className="live-head">
        <h2 className="node-ticker">{detail.title}</h2>
        {detail.headline ? <p className="value-headline">{detail.headline}</p> : null}
        {detail.partial ? <p className="finance-partial">partial</p> : null}
        {detail.lines.length > 0 ? (
          <ul className="parent-lines">
            {detail.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </header>
      {detail.missing.length > 0 ? (
        <ul className="parent-lines">
          {detail.missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {detail.alerts.length > 0 ? (
        <ul className="finance-alerts">
          {detail.alerts.map((alert) => (
            <li key={`${alert.severity}-${alert.message}`}>
              {alert.severity === "info" ? (
                <span className="finance-severity">{alert.severity}</span>
              ) : (
                <span className="warn-badge">{alert.severity}</span>
              )}
              {alert.message}
            </li>
          ))}
        </ul>
      ) : null}
      {detail.flow && detail.flow.length > 0 ? <CashFlowBars months={detail.flow} wide /> : null}
      {detail.amounts && detail.amounts.length > 1 && detail.amountLabel === "Net worth" ? (
        <AmountLine points={detail.amounts} label={detail.amountLabel} />
      ) : null}
      {detail.amounts && detail.amounts.length > 0 && detail.amountLabel === "Fees by month" ? (
        <AmountBars points={detail.amounts} label={detail.amountLabel} />
      ) : null}
      {detail.tables.map((table) => (
        <FinanceTable key={table.title} table={table} />
      ))}
    </section>
  );
}
