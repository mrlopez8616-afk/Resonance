import { fetchCryptoQuotes } from "@/lib/fetch-crypto";
import { fetchEquityQuotes } from "@/lib/fetch-equities";

export const dynamic = "force-dynamic";

type CacheEntry = {
  at: number;
  body: unknown;
};

let cache: CacheEntry | null = null;
const TTL_MS = 60_000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return Response.json(cache.body, {
      headers: { "x-resonance-cache": "hit" },
    });
  }

  const fetchedAt = new Date().toISOString();
  const [cryptoSettled, equitiesSettled] = await Promise.allSettled([
    fetchCryptoQuotes(),
    fetchEquityQuotes(),
  ]);

  const body = {
    fetchedAt,
    crypto:
      cryptoSettled.status === "fulfilled"
        ? {
            source: cryptoSettled.value.source,
            status: "ok" as const,
            error: null,
            quotes: cryptoSettled.value.quotes,
          }
        : {
            source: null,
            status: "error" as const,
            error:
              cryptoSettled.reason instanceof Error
                ? cryptoSettled.reason.message
                : "Crypto price fetch failed",
            quotes: {},
          },
    equities:
      equitiesSettled.status === "fulfilled"
        ? {
            source: equitiesSettled.value.source,
            status: "ok" as const,
            error: null,
            quotes: equitiesSettled.value.quotes,
          }
        : {
            source: null,
            status: "error" as const,
            error:
              equitiesSettled.reason instanceof Error
                ? equitiesSettled.reason.message
                : "Equity price fetch failed",
            quotes: {},
          },
  };

  cache = { at: Date.now(), body };
  return Response.json(body, {
    headers: { "x-resonance-cache": "miss" },
  });
}
