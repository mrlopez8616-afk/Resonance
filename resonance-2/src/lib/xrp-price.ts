import "server-only";

import { fetchSpotUsd, loadSpotQuote } from "@/lib/spot-price";

/** @deprecated Use fetchSpotUsd("XRP"). */
export async function fetchXrpUsd() {
  return fetchSpotUsd("XRP");
}

/** @deprecated Use loadSpotQuote("XRP"). */
export async function loadXrpQuote() {
  return loadSpotQuote("XRP");
}
