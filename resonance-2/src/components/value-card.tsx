import type { ReactNode } from "react";
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
  compact = false,
  children,
}: {
  ticker: string;
  model: ValueCardModel;
  priceTitle?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`live-face value-card${compact ? " parent-face" : ""}`}>
      <header className="live-head">
        <h2 className="node-ticker">{ticker}</h2>
        {model.headline ? (
          <p className="value-headline">{model.headline}</p>
        ) : model.label ? (
          <p className="node-note value-status">{model.label}</p>
        ) : null}
        {model.priceLine ? (
          <p className="value-price" title={priceTitle}>
            {model.priceLine}
          </p>
        ) : null}
      </header>
      {children}
    </div>
  );
}
