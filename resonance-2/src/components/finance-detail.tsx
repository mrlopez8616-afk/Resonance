import { AmountBars, AmountLine, CashFlowBars } from "@/components/home-visual";
import { FinanceAsOf } from "@/components/finance-floor";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import { latestTimestamp, type NodePart } from "@/lib/node-layout";
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
  updatedAt = null,
  backHref = "/n/finance",
}: {
  detail: FinanceDetailModel;
  asOf: string;
  stale: boolean;
  /** Real snapshot clock. The civil as-of date is not a timestamp. */
  updatedAt?: string | null;
  backHref?: string;
}) {
  const parts: NodePart[] = [detail.headline ? "live" : "missing"];
  if (detail.partial || detail.missing.length > 0) parts.push("partial");
  const hasTrend = Boolean(
    (detail.flow && detail.flow.length > 0) || (detail.amounts && detail.amounts.length > 0),
  );
  const hasList =
    detail.lines.length > 0 || detail.missing.length > 0 || detail.alerts.length > 0 || detail.tables.length > 0;
  return (
    <NodeLayout>
      <NodeHeader name={detail.title} parts={parts} updatedAt={latestTimestamp([updatedAt])} backHref={backHref} />
      <FinanceAsOf asOf={asOf} stale={stale} />
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            {detail.headline ? (
              <StatCard
                label={detail.title}
                money
                value={detail.headline}
                detail={detail.partial ? "partial" : (detail.lines[0] ?? null)}
              />
            ) : (
              <EmptyCard label={detail.title} />
            )}
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="trends" empty={!hasTrend}>
          {detail.flow && detail.flow.length > 0 ? <CashFlowBars months={detail.flow} wide /> : null}
          {detail.amounts && detail.amounts.length > 1 && detail.amountLabel === "Net worth" ? (
            <AmountLine points={detail.amounts} label={detail.amountLabel} />
          ) : null}
          {detail.amounts && detail.amounts.length > 0 && detail.amountLabel === "Fees by month" ? (
            <AmountBars points={detail.amounts} label={detail.amountLabel} />
          ) : null}
        </NodeSection>
        <NodeSection kind="lists" empty={!hasList}>
          {detail.lines.length > 0 ? (
            <ul className="parent-lines">
              {detail.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
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
          {detail.tables.map((table) => (
            <FinanceTable key={table.title} table={table} />
          ))}
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
