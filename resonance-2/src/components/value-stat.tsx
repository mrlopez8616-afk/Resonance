import { EmptyCard, StatCard } from "@/components/node-layout";
import type { CardSpan } from "@/lib/node-layout";
import type { ValueCardModel } from "@/lib/value-card";

/**
 * Boxed value card.
 * A real position is the large line. The live price is the smaller line.
 * No quantity source: the price and "no position" stay in the box, and the
 * large line is not a made-up dollar value. No price and no quantity: the
 * connect box.
 */
export function ValueStatCard({
  label,
  model,
  href,
  span = "stat",
  onRemove,
}: {
  label: string;
  model: ValueCardModel;
  href?: string;
  span?: CardSpan;
  onRemove?: () => void;
}) {
  if (model.headline) {
    return (
      <StatCard
        label={label}
        money
        href={href}
        span={span}
        value={model.headline}
        detail={model.priceLine}
        onRemove={onRemove}
      />
    );
  }
  if (model.priceLine) {
    const note = model.label === "not connected" ? "not connected" : "no position";
    return (
      <StatCard label={label} money href={href} span={span} value={note} detail={model.priceLine} onRemove={onRemove} />
    );
  }
  return <EmptyCard label={label} span={span} onRemove={onRemove} />;
}
