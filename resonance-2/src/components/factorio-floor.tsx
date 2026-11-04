import { NodeFace } from "@/components/node-face";
import { EmptyCard, NodeGrid, NodeHeader, NodeLayout, NodeSection, NodeSections, StatCard } from "@/components/node-layout";
import {
  factorioChartGeometry,
  factorioItemLabel,
  formatCount,
  formatPerMinute,
  formatPlayHours,
  type FactorioChartPoint,
  type FactorioHomeModel,
  type FactorioLatest,
} from "@/lib/factorio";
import { factorioHomeFace } from "@/lib/home-faces";
import type { NodePart } from "@/lib/node-layout";
import styles from "@/components/factorio-floor.module.css";

export function FactorioHomeCard({ card }: { card: FactorioHomeModel }) {
  return <NodeFace face={factorioHomeFace(card)} />;
}

export function FactorioFloor({
  latest,
  history,
  stale,
  unavailable,
}: {
  latest: FactorioLatest | null;
  history: readonly FactorioChartPoint[];
  stale: boolean;
  unavailable: boolean;
}) {
  const parts: NodePart[] = !latest || unavailable ? ["missing"] : stale ? ["partial"] : ["live"];
  const chart = latest && !unavailable ? factorioChartGeometry(history) : null;
  const percent =
    latest?.researchProgress === null || latest?.researchProgress === undefined
      ? null
      : Math.round(latest.researchProgress * 100);
  return (
    <NodeLayout>
      <NodeHeader
        name="Factorio"
        parts={parts}
        updatedAt={unavailable ? null : latest?.receivedAt}
        backHref="/"
      />
      {stale && latest && !unavailable ? (
        <p className={styles.stale} role="status">
          Feed is stale. The last snapshot is older than 30 minutes while a player is connected.
        </p>
      ) : null}
      <NodeSections>
        <NodeSection kind="numbers">
          <NodeGrid>
            {latest && !unavailable ? (
              <>
                <StatCard label="Hours played" value={formatPlayHours(latest.playHours)} />
                <StatCard label="Rockets" value={formatCount(latest.rockets)} />
                <StatCard label="Technologies" value={formatCount(latest.technologies)} />
                {latest.machines.length > 0 ? (
                  latest.machines.map((machine) => (
                    <StatCard
                      key={machine.name}
                      label={factorioItemLabel(machine.name)}
                      value={formatCount(machine.total)}
                    />
                  ))
                ) : (
                  <EmptyCard label="Machines" />
                )}
              </>
            ) : (
              <>
                <EmptyCard label="Hours played" />
                <EmptyCard label="Rockets" />
                <EmptyCard label="Technologies" />
                <EmptyCard label="Machines" />
              </>
            )}
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="trends">
          <NodeGrid>
            {latest && !unavailable && latest.currentResearch ? (
              <StatCard span="trend" label="Current research" value={factorioItemLabel(latest.currentResearch)}>
                {percent !== null ? (
                  <div
                    className={styles.bar}
                    role="progressbar"
                    aria-label="Research progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <span className={styles.fill} style={{ width: `${percent}%` }} />
                  </div>
                ) : null}
              </StatCard>
            ) : (
              <EmptyCard span="trend" label="Current research" />
            )}
            {chart ? (
              <StatCard span="trend" label="History">
                <p className={styles.legend}>
                  <span>
                    <span className={`${styles.swatch} ${styles.swatchRockets}`} aria-hidden="true" />
                    Rockets
                  </span>
                  <span>
                    <span className={styles.swatch} aria-hidden="true" />
                    Hours
                  </span>
                </p>
                <svg className={styles.chart} viewBox="0 0 320 96" role="img" aria-label="Rockets and hours played">
                  <path className={styles.rockets} d={chart.rockets} />
                  <path className={styles.hours} d={chart.hours} />
                </svg>
              </StatCard>
            ) : null}
          </NodeGrid>
        </NodeSection>
        <NodeSection kind="lists">
          <NodeGrid>
            {latest && !unavailable && latest.production.length > 0 ? (
              <StatCard span="list" label="Top production">
                <ul className={styles.rows}>
                  {latest.production.map((row) => (
                    <li key={row.name}>
                      <span>{factorioItemLabel(row.name)}</span>
                      <span>{formatPerMinute(row.perMin)}</span>
                    </li>
                  ))}
                </ul>
              </StatCard>
            ) : (
              <EmptyCard span="list" label="Top production" />
            )}
            {latest && !unavailable && latest.science.length > 0 ? (
              <StatCard span="list" label="Science produced">
                <ul className={styles.rows}>
                  {latest.science.map((row) => (
                    <li key={row.name}>
                      <span>{factorioItemLabel(row.name)}</span>
                      <span>{formatCount(row.total)}</span>
                    </li>
                  ))}
                </ul>
              </StatCard>
            ) : (
              <EmptyCard span="list" label="Science produced" />
            )}
          </NodeGrid>
        </NodeSection>
      </NodeSections>
    </NodeLayout>
  );
}
