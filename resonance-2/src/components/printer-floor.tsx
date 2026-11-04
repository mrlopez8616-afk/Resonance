import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import {
  INK_GAUGES,
  PRINTER_MODEL,
  formatInkPercent,
  inkGauges,
  type PrinterLatest,
} from "@/lib/printer";
import type { NodePart } from "@/lib/node-layout";
import styles from "@/components/printer-floor.module.css";

const FILL = {
  C: styles.fillC,
  M: styles.fillM,
  Y: styles.fillY,
  K: styles.fillK,
} as const;

export function PrinterFloor({
  latest,
  stale,
  unavailable,
}: {
  latest: PrinterLatest | null;
  stale: boolean;
  unavailable: boolean;
}) {
  const gauges = latest && !unavailable ? inkGauges(latest.supplies) : inkGauges([]);
  const parts: NodePart[] = !latest || unavailable ? ["missing"] : stale ? ["partial"] : ["live"];
  return (
    <NodeLayout>
      <NodeHeader
        name="Printer"
        parts={parts}
        updatedAt={unavailable ? null : latest?.shownAt}
        backHref="/"
      />
      <p className={styles.model}>{PRINTER_MODEL}</p>
      {stale && latest && !unavailable ? (
        <p className={styles.stale} role="status" data-stale="true">
          Stale. No reading in the last 24 hours.
        </p>
      ) : null}
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            {INK_GAUGES.map((slot) => {
              const gauge = gauges.find((row) => row.color === slot.color);
              if (!gauge || gauge.percent === null) {
                return <EmptyCard key={slot.color} label={slot.label} />;
              }
              const percent = Math.round(gauge.percent);
              const detail = [gauge.state, gauge.buy].filter(Boolean).join(" · ");
              return (
                <StatCard key={slot.color} label={slot.label} value={formatInkPercent(gauge.percent)} detail={detail || null}>
                  <div
                    className={styles.bar}
                    role="progressbar"
                    aria-label={`${slot.label} ink`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <span className={`${styles.fill} ${FILL[slot.color]}`} style={{ width: `${percent}%` }} />
                  </div>
                </StatCard>
              );
            })}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
