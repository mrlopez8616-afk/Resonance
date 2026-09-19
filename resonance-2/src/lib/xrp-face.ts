import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import {
  assembleLiveFace,
  type LiveFaceData,
  type SpotQuote,
} from "@/lib/live-face";

/** @deprecated Use SpotQuote from live-face. Kept so the XRP brick path still resolves. */
export type XrpQuote = SpotQuote;
/** @deprecated Use LiveFaceData from live-face. */
export type XrpFaceData = LiveFaceData;

export {
  assembleLiveFace,
  formatCompactUsd,
  formatSleeveQuantity,
  formatSpotPrice as formatXrpPrice,
  sleeveQuantityNumber,
  totalSleeveQuantity,
} from "@/lib/live-face";

export function assembleXrpFace(
  sleeves = XRP_SLEEVES,
  quote: SpotQuote | null = null,
): LiveFaceData {
  return assembleLiveFace("XRP", sleeves, quote);
}
