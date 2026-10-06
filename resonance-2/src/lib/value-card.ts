import { isDecimalString } from "@/lib/decimal";

export type ValueCardLabel = "no position" | "not connected";

/** Presentation for one holding. Headline is dollars only when both inputs are real. */
export type ValueCardModel = {
  /** Compact position value. Null when quantity or live price is missing. */
  headline: string | null;
  /** Existing spot print plus "live". Null when there is no live price. */
  priceLine: string | null;
  /** Set when the headline cannot be a real value. */
  label: ValueCardLabel | null;
};

export type ValueCardFace = {
  priceUsd: number | null;
  priceLabel: string;
  totalUsd: number | null;
  totalUsdLabel: string;
  sleeves: readonly { quantity: string }[];
};

function livePrice(face: ValueCardFace): boolean {
  return (
    typeof face.priceUsd === "number" &&
    Number.isFinite(face.priceUsd) &&
    face.priceUsd > 0 &&
    face.priceLabel !== "—"
  );
}

/**
 * Value first.
 * A headline exists only for a real quantity source times a live price,
 * including a real zero quantity. An empty sleeve list is not a quantity.
 */
export function valueCardFromFace(face: ValueCardFace): ValueCardModel {
  const priced = livePrice(face);
  const priceLine = priced ? `${face.priceLabel} live` : null;
  const quantityKnown =
    face.sleeves.length > 0 &&
    face.sleeves.every((sleeve) => isDecimalString(sleeve.quantity));
  const valued =
    quantityKnown &&
    typeof face.totalUsd === "number" &&
    Number.isFinite(face.totalUsd);

  if (valued) {
    return { headline: face.totalUsdLabel, priceLine, label: null };
  }
  if (!quantityKnown) {
    return {
      headline: null,
      priceLine,
      label: face.sleeves.length === 0 && priced ? "no position" : "not connected",
    };
  }
  return { headline: null, priceLine: null, label: "not connected" };
}
