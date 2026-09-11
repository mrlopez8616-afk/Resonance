"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PriceBook, Quote } from "@/lib/types";

const loadingBook: PriceBook = {
  fetchedAt: null,
  crypto: { source: null, status: "loading", error: null, quotes: {} },
  equities: { source: null, status: "loading", error: null, quotes: {} },
};

type PricesContextValue = {
  book: PriceBook;
  refresh: (opts?: { showLoading?: boolean }) => Promise<void>;
  quoteFor: (ticker: string) => Quote | null;
};

const PricesContext = createContext<PricesContextValue | null>(null);

async function requestPrices(): Promise<PriceBook> {
  const response = await fetch("/api/prices", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Price API HTTP ${response.status}`);
  }
  const data = (await response.json()) as PriceBook;
  return {
    fetchedAt: data.fetchedAt,
    crypto: {
      source: data.crypto.source,
      status: data.crypto.status,
      error: data.crypto.error,
      quotes: data.crypto.quotes ?? {},
    },
    equities: {
      source: data.equities.source,
      status: data.equities.status,
      error: data.equities.error,
      quotes: data.equities.quotes ?? {},
    },
  };
}

export function PricesProvider({ children }: { children: ReactNode }) {
  const [book, setBook] = useState<PriceBook>(loadingBook);

  const refresh = useCallback(async (opts?: { showLoading?: boolean }) => {
    if (opts?.showLoading) {
      setBook((current) => ({
        ...current,
        crypto: { ...current.crypto, status: "loading", error: null },
        equities: { ...current.equities, status: "loading", error: null },
      }));
    }
    try {
      const next = await requestPrices();
      setBook(next);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Price request failed";
      setBook((current) => ({
        fetchedAt: current.fetchedAt,
        crypto: {
          source: current.crypto.source,
          status: "error",
          error: message,
          quotes: current.crypto.quotes,
        },
        equities: {
          source: current.equities.source,
          status: "error",
          error: message,
          quotes: current.equities.quotes,
        },
      }));
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void requestPrices()
        .then(setBook)
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Price request failed";
          setBook((current) => ({
            fetchedAt: current.fetchedAt,
            crypto: {
              ...current.crypto,
              status: "error",
              error: message,
            },
            equities: {
              ...current.equities,
              status: "error",
              error: message,
            },
          }));
        });
    }, 120_000);

    void requestPrices()
      .then(setBook)
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Price request failed";
        setBook({
          fetchedAt: null,
          crypto: {
            source: null,
            status: "error",
            error: message,
            quotes: {},
          },
          equities: {
            source: null,
            status: "error",
            error: message,
            quotes: {},
          },
        });
      });

    return () => window.clearInterval(interval);
  }, []);

  const quoteFor = useCallback(
    (ticker: string) => {
      return book.crypto.quotes[ticker] ?? book.equities.quotes[ticker] ?? null;
    },
    [book],
  );

  const value = useMemo(
    () => ({ book, refresh, quoteFor }),
    [book, refresh, quoteFor],
  );

  return (
    <PricesContext.Provider value={value}>{children}</PricesContext.Provider>
  );
}

export function usePrices(): PricesContextValue {
  const ctx = useContext(PricesContext);
  if (!ctx) {
    throw new Error("usePrices must be used inside PricesProvider");
  }
  return ctx;
}
