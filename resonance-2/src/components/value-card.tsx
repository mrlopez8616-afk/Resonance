import type { ReactNode } from "react";
import { StatCard } from "@/components/node-layout";
import { ValueStatCard } from "@/components/value-stat";
import type { ValueCardModel } from "@/lib/value-card";

/**
 * Shared value-node card. The headline number is position value.
 * The live price is the smaller line under it. Callers that are not
 * holdings do not use this component.
 */
export function ValueCard({
  ticker,
  model,
  priceTitle,
  href,
  children,
}: {
  ticker: string;
  model: ValueCardModel;
  priceTitle?: string;
  href?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <ValueStatCard label={ticker} model={model} href={href} title={priceTitle} />
      {children ? (
        <StatCard span="list" label="Position">
          {children}
        </StatCard>
      ) : null}
    </>
  );
}
