import "server-only";

import { readCoinbaseCredentials } from "@/lib/coinbase-portfolio";
import {
  applyBrokerPositions,
  describeBrokerSync,
  readRobinhoodCredentials,
  robinhoodEquityMark,
  safeSyncMessage,
  type BrokerSnapshot,
  type BrokerSyncStatus,
  type BrokerSyncView,
  type BrokerVenue,
} from "@/lib/broker-sync";
import { sqlQuery, sqlTransaction, type SqlStatement } from "@/lib/pg/client";

type StateRow = {
  venue: string;
  status: string;
  synced_at: unknown;
};

type PositionRow = {
  venue: string;
  sleeve_id: string;
  ticker: string;
  quantity: string;
};

type BalanceRow = {
  venue: string;
  currency: string;
  amount: string;
};

type OrderRow = {
  venue: string;
};

function instantText(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function storedStatus(value: string): Exclude<BrokerSyncStatus, "never"> | null {
  if (value === "ok" || value === "error" || value === "not_configured") return value;
  return null;
}

export async function saveBrokerSnapshot(
  venue: BrokerVenue,
  snapshot: BrokerSnapshot,
  now: Date,
): Promise<void> {
  const syncedAt = now.toISOString();
  const statements: SqlStatement[] = [
    { text: "DELETE FROM broker_positions WHERE venue = $1", params: [venue] },
    { text: "DELETE FROM broker_balances WHERE venue = $1", params: [venue] },
    { text: "DELETE FROM broker_orders WHERE venue = $1", params: [venue] },
  ];
  for (const position of snapshot.positions) {
    statements.push({
      text: `INSERT INTO broker_positions (venue, sleeve_id, ticker, quantity, synced_at)
             VALUES ($1, $2, $3, $4, $5)`,
      params: [venue, position.sleeveId, position.ticker, position.quantity, syncedAt],
    });
  }
  for (const balance of snapshot.balances) {
    statements.push({
      text: `INSERT INTO broker_balances (venue, currency, amount, synced_at)
             VALUES ($1, $2, $3, $4)`,
      params: [venue, balance.currency, balance.amount, syncedAt],
    });
  }
  for (const order of snapshot.orders.slice(0, 50)) {
    statements.push({
      text: `INSERT INTO broker_orders
               (venue, order_id, ticker, side, quantity, price, status, filled_at, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      params: [
        venue,
        order.orderId,
        order.ticker,
        order.side,
        order.quantity,
        order.price,
        order.status,
        order.filledAt,
        syncedAt,
      ],
    });
  }
  const note = [
    "positions saved",
    snapshot.balancesUnread ? "balances unread" : "",
    snapshot.ordersUnread ? "orders unread" : "",
  ]
    .filter(Boolean)
    .join("; ");
  statements.push({
    text: `INSERT INTO broker_sync_state (venue, status, synced_at, checked_at, message)
           VALUES ($1, 'ok', $2, $2, $3)
           ON CONFLICT (venue) DO UPDATE
           SET status = 'ok',
               synced_at = EXCLUDED.synced_at,
               checked_at = EXCLUDED.checked_at,
               message = EXCLUDED.message`,
    params: [venue, syncedAt, safeSyncMessage(note)],
  });
  await sqlTransaction(statements);
}

export async function saveBrokerStatus(input: {
  venue: BrokerVenue;
  status: "error" | "not_configured";
  checkedAt: string;
  message: string;
}): Promise<void> {
  await sqlQuery(
    `INSERT INTO broker_sync_state (venue, status, synced_at, checked_at, message)
     VALUES ($1, $2, NULL, $3, $4)
     ON CONFLICT (venue) DO UPDATE
     SET status = EXCLUDED.status,
         checked_at = EXCLUDED.checked_at,
         message = EXCLUDED.message`,
    [input.venue, input.status, input.checkedAt, safeSyncMessage(input.message)],
  );
}

export async function readBrokerSyncView(
  now: Date,
  env: Record<string, string | undefined> = process.env,
): Promise<BrokerSyncView> {
  const coinbaseConfigured = readCoinbaseCredentials(env) !== null;
  const robinhoodConfigured = readRobinhoodCredentials(env) !== null;
  try {
    const [states, balances, orders] = await Promise.all([
      sqlQuery<StateRow>("SELECT venue, status, synced_at FROM broker_sync_state"),
      sqlQuery<BalanceRow>("SELECT venue, currency, amount FROM broker_balances"),
      sqlQuery<OrderRow>("SELECT venue FROM broker_orders"),
    ]);
    const byVenue = new Map(states.map((row) => [row.venue, row]));
    const mark = (venue: BrokerVenue, label: string, configured: boolean) => {
      const row = byVenue.get(venue);
      const status = row ? storedStatus(row.status) : null;
      const syncedAt = instantText(row?.synced_at);
      const resolved: BrokerSyncStatus = status ?? (configured ? "never" : "not_configured");
      const orderCount = orders.filter((order) => order.venue === venue).length;
      const cash = balances
        .filter((balance) => balance.venue === venue)
        .map((balance) => ({ currency: balance.currency, amount: balance.amount }));
      return describeBrokerSync({
        label,
        status: resolved,
        syncedAt,
        now,
        orders: orderCount,
        balances: resolved === "not_configured" ? [] : cash,
      });
    };
    return {
      coinbase: mark("coinbase", "Coinbase", coinbaseConfigured),
      robinhood: mark("robinhood", "Robinhood", robinhoodConfigured),
      equity: robinhoodEquityMark(now),
    };
  } catch {
    return {
      coinbase: describeBrokerSync({
        label: "Coinbase",
        status: coinbaseConfigured ? "error" : "not_configured",
        syncedAt: null,
        now,
      }),
      robinhood: describeBrokerSync({
        label: "Robinhood",
        status: robinhoodConfigured ? "error" : "not_configured",
        syncedAt: null,
        now,
      }),
      equity: robinhoodEquityMark(now),
    };
  }
}

/** Last successful or failed read. A not-configured venue does not replace sleeve prints. */
export async function overlayStoredBrokerBooks<T extends Record<string, readonly { id: string; quantity: string; manual?: boolean }[]>>(
  books: T,
): Promise<T> {
  try {
    const states = await sqlQuery<StateRow>("SELECT venue, status, synced_at FROM broker_sync_state");
    const allowed = new Set(
      states
        .filter((row) => (row.status === "ok" || row.status === "error") && instantText(row.synced_at))
        .map((row) => row.venue),
    );
    if (allowed.size === 0) return books;
    const positions = await sqlQuery<PositionRow>(
      "SELECT venue, sleeve_id, ticker, quantity FROM broker_positions",
    );
    return applyBrokerPositions(
      books,
      positions
        .filter((row) => allowed.has(row.venue))
        .map((row) => ({ ticker: row.ticker, sleeveId: row.sleeve_id, quantity: row.quantity })),
    );
  } catch {
    return books;
  }
}
